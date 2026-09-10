import { browser } from "wxt/browser";
import { z } from "zod";
import { connection, getConfiguration } from "../lib/configuration";
import { screenshotCrop } from "../lib/screenshot";
import { getSession, putSession, sessionSummaries, updateSession } from "../lib/db";
import {
  MAX_LOGS,
  MAX_CONSOLE_BYTES,
  originSchema,
  isNotionUrl,
  type ConsoleEntry,
  type Session,
  type Target,
} from "../lib/models";

async function activeSessionsMap() {
  const { activeSessions } = await browser.storage.session.get("activeSessions");
  return z.record(z.string(), z.string()).parse(activeSessions ?? {});
}
export async function activeId(tabId: number): Promise<string | undefined> {
  return (await activeSessionsMap())[tabId];
}
async function setActive(tabId: number, id?: string) {
  await navigator.locks.request("active-sessions", async () => {
    const activeSessions = await activeSessionsMap();
    if (id) activeSessions[tabId] = id;
    else delete activeSessions[tabId];
    await browser.storage.session.set({ activeSessions });
  });
}
export async function current(tabId: number) {
  const id = await activeId(tabId);
  return id ? getSession(id) : undefined;
}
export async function pause(tabId: number) {
  const id = await activeId(tabId);
  await setActive(tabId);
  try {
    await browser.debugger?.detach({ tabId });
  } catch {}
  if (id)
    await updateSession(id, (s) => ({
      ...s,
      pendingCapture: undefined,
      consoleStatus: s.consoleStatus === "recording" ? "stopped" : s.consoleStatus,
    }));
}
export async function start(tabId: number) {
  const tab = await browser.tabs.get(tabId);
  const origin = originSchema.parse(tab.url);
  if (isNotionUrl(origin))
    throw Error("Sur Notion, configurez une destination depuis l’extension.");
  const config = await getConfiguration();
  const association = config.associations.find((a) => a.origin === origin);
  const destination = config.destinations.find((d) => d.id === association?.destinationId);
  if (!destination || !association) throw Error("Associez d’abord ce site à une base Notion.");
  await connection(destination.connectionId);
  const active = await current(tabId);
  if (
    active?.status === "draft" &&
    active.origin === origin &&
    active.destination.id === destination.id &&
    active.consoleStatus === "recording"
  ) {
    await inject(tabId);
    return active;
  }
  if (active) await pause(tabId);
  const previousSummary = (await sessionSummaries()).find(
    (s) => s.status === "draft" && s.origin === origin && s.destination.id === destination.id,
  );
  const previous = previousSummary ? await getSession(previousSummary.id) : undefined;
  // A draft resumes in one tab at a time, even when a tab was closed or the browser restarted.
  if (previous) {
    const activeSessions = await activeSessionsMap();
    if (
      Object.entries(activeSessions).some(
        ([key, id]) => id === previous.id && Number(key) !== tabId,
      )
    )
      throw Error("Ce brouillon est déjà ouvert dans un autre onglet.");
  }
  const session: Session = previous
    ? { ...previous, tabId }
    : {
        id: crypto.randomUUID(),
        tabId,
        origin,
        destination,
        environment: association.environment,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        annotations: [],
        console: [],
        droppedLogs: 0,
        consoleStatus: "unavailable",
        status: "draft",
        attempts: 0,
        uploads: {},
      };
  await putSession(session);
  await setActive(tabId, session.id);
  try {
    if (!browser.debugger) throw Error("Console indisponible sur Firefox.");
    await browser.debugger.attach({ tabId }, "1.3");
    await updateSession(session.id, (s) => ({
      ...s,
      consoleStatus: "recording",
      consoleReason: undefined,
    }));
    await browser.debugger.sendCommand({ tabId }, "Runtime.enable");
    await browser.debugger.sendCommand({ tabId }, "Log.enable");
  } catch {
    await updateSession(session.id, (s) => ({
      ...s,
      consoleStatus: "unavailable",
      consoleReason: import.meta.env.FIREFOX
        ? "La collecte console n’est pas disponible dans la version Firefox."
        : "Console indisponible : fermez les DevTools puis reprenez la session pour activer la collecte.",
    }));
  }
  try {
    await inject(tabId);
  } catch {
    await pause(tabId);
    throw Error("Impossible d’annoter cette page. Ouvrez une page web classique et réessayez.");
  }
  return (await getSession(session.id))!;
}
export async function inject(tabId: number) {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["/content-scripts/annotator.js"],
  });
}
export async function logEvent(tabId: number, entry: ConsoleEntry) {
  const id = await activeId(tabId);
  if (!id) return;
  await updateSession(id, (s) => {
    if (s.status !== "draft") return s;
    return { ...s, ...appendConsole(s, entry) };
  });
}
const logBytes = (entry: ConsoleEntry) => new TextEncoder().encode(JSON.stringify(entry)).length;
export function appendConsole(
  state: Pick<Session, "console" | "consoleBytes" | "droppedLogs">,
  entry: ConsoleEntry,
) {
  const logs = [...state.console, entry];
  let bytes =
    (state.consoleBytes ?? state.console.reduce((n, e) => n + logBytes(e), 0)) + logBytes(entry);
  let dropped = 0;
  while (logs.length - dropped > MAX_LOGS || bytes > MAX_CONSOLE_BYTES) {
    bytes -= logBytes(logs[dropped++]!);
  }
  return {
    console: logs.slice(dropped),
    consoleBytes: bytes,
    droppedLogs: state.droppedLogs + dropped,
  };
}
export function consoleEvent(method: string, value: unknown): ConsoleEntry | undefined {
  const p = value as {
    type?: string;
    timestamp?: number;
    args?: Array<{ value?: unknown; description?: string; type?: string }>;
    stackTrace?: {
      callFrames?: Array<{
        functionName?: string;
        url?: string;
        lineNumber?: number;
        columnNumber?: number;
      }>;
    };
    exceptionDetails?: {
      text?: string;
      exception?: { description?: string };
      stackTrace?: unknown;
      url?: string;
    };
    entry?: { level: string; text: string; url?: string; timestamp?: number };
  };
  const stack = p.stackTrace?.callFrames
    ?.map(
      (f) =>
        `${f.functionName || "(anonyme)"} (${f.url}:${(f.lineNumber ?? 0) + 1}:${(f.columnNumber ?? 0) + 1})`,
    )
    .join("\n")
    .slice(0, 8000);
  if (method === "Runtime.consoleAPICalled")
    return {
      level: p.type ?? "log",
      timestamp: new Date(p.timestamp ?? Date.now()).toISOString(),
      text: (p.args ?? [])
        .map((arg) => {
          if (arg.value !== undefined) {
            try {
              return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
            } catch {
              return "[non sérialisable]";
            }
          }
          return arg.description ?? arg.type ?? "";
        })
        .join(" ")
        .slice(0, 8000),
      stack,
    };
  if (method === "Runtime.exceptionThrown")
    return {
      level: "exception",
      timestamp: new Date().toISOString(),
      text: (
        p.exceptionDetails?.exception?.description ??
        p.exceptionDetails?.text ??
        "Erreur JavaScript"
      ).slice(0, 8000),
      url: p.exceptionDetails?.url,
    };
  if (method === "Log.entryAdded" && p.entry)
    return {
      ...p.entry,
      text: p.entry.text.slice(0, 8000),
      timestamp: new Date(p.entry.timestamp ?? Date.now()).toISOString(),
    };
}
export async function capture(tabId: number, target: Target) {
  const tab = await browser.tabs.get(tabId);
  if (!tab.active || tab.url !== target.url)
    throw Error("Revenez sur la page sélectionnée avant de capturer.");
  let image: string;
  try {
    const result = z.object({ data: z.string() }).parse(
      await browser.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      }),
    );
    image = `data:image/png;base64,${result.data}`;
  } catch {
    image = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  }
  const bitmap = await createImageBitmap(await (await fetch(image)).blob());
  let canvas: OffscreenCanvas;
  try {
    const after = await browser.tabs.get(tabId);
    if (!after.active || after.url !== target.url)
      throw Error("La page a changé pendant la capture. Réessayez.");
    const crop = screenshotCrop(target, bitmap);
    const width = Math.min(1600, crop.width);
    const height = Math.max(1, Math.round((crop.height * width) / crop.width));
    canvas = new OffscreenCanvas(width, height);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } finally {
    bitmap.close();
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (blob.size > 5 * 1024 * 1024)
    throw Error("Capture trop volumineuse. Réduisez la fenêtre puis réessayez.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}
