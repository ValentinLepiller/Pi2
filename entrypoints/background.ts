import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { contentCommands, messageSchema, type Message } from "../src/lib/messages";
import {
  connection,
  getConfiguration,
  getConnections,
  saveConfiguration,
  setConnection,
  removeConnection,
} from "../src/lib/configuration";
import { deleteSession, getSession, sessionSummaries, updateSession } from "../src/lib/db";
import { MAX_ANNOTATIONS, summarize, type Destination } from "../src/lib/models";
import { Notion, sessionPayload } from "../src/background/notion";
import {
  activeId,
  capture,
  consoleEvent,
  current,
  logEvent,
  pause,
  start,
} from "../src/background/sessions";
import { toggleAnnotations } from "../src/background/shortcut";
import { processQueue, retry } from "../src/background/queue";

export default defineBackground(() => {
  const ready = Promise.all(
    import.meta.env.FIREFOX
      ? []
      : [
          browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
          browser.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
        ],
  );
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== "toggle-annotations") return;
    void ready
      .then(() => toggleAnnotations(tab))
      .catch(() => {
        console.error("Le raccourci Pi2 n’a pas pu s’exécuter.");
      });
  });
  browser.runtime.onInstalled.addListener(() => {
    void browser.alarms.create("send-feedbacks", { periodInMinutes: 1 });
  });
  browser.runtime.onStartup.addListener(() => {
    void browser.alarms.create("send-feedbacks", { periodInMinutes: 1 });
    void processQueue();
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "send-feedbacks") void processQueue();
  });
  browser.debugger?.onEvent.addListener((source, method, params) => {
    if (source.tabId !== undefined) {
      const entry = consoleEvent(method, params);
      if (entry) void logEvent(source.tabId, entry);
    }
  });
  browser.debugger?.onDetach.addListener((source) => {
    if (source.tabId !== undefined)
      void (async () => {
        const id = await activeId(source.tabId!);
        if (id)
          await updateSession(id, (s) => ({
            ...s,
            consoleStatus: "unavailable",
            consoleReason:
              "La collecte console a été interrompue. Les événements déjà capturés sont conservés.",
          }));
      })();
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    void pause(tabId);
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url)
      void (async () => {
        const s = await current(tabId);
        if (s && new URL(change.url!).origin !== s.origin) await pause(tabId);
      })();
  });
  browser.runtime.onMessage.addListener((raw, sender, respond) => {
    if (sender.id !== browser.runtime.id) return false;
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) {
      respond({ ok: false, error: "Demande invalide." });
      return false;
    }
    const trusted = sender.url?.startsWith(browser.runtime.getURL("")) === true;
    const fromPage = !trusted;
    if (fromPage && (!contentCommands.has(parsed.data.type) || sender.frameId !== 0)) {
      respond({ ok: false, error: "Action non autorisée depuis une page." });
      return false;
    }
    if (fromPage && sender.tab?.id === undefined) {
      respond({ ok: false, error: "Contexte non autorisé." });
      return false;
    }
    void ready
      .then(() => handle(parsed.data, sender))
      .then((data) => respond({ ok: true, data }))
      .catch((error) =>
        respond({
          ok: false,
          error: error instanceof Error ? error.message : "Une erreur est survenue.",
        }),
      );
    return true;
  });
});
async function rememberDestinations(destinations: Destination[]) {
  await saveConfiguration((config) => ({
    ...config,
    destinations: [
      ...config.destinations.filter((d) => !destinations.some((n) => n.id === d.id)),
      ...destinations,
    ],
  }));
}
async function handle(message: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "state": {
      const [configuration, connections, sessions, { shortcutError }, commands] = await Promise.all(
        [
          getConfiguration(),
          getConnections(),
          sessionSummaries(),
          browser.storage.session.get("shortcutError"),
          browser.commands.getAll(),
        ],
      );
      return {
        configuration,
        connections: connections.map(({ token: _token, ...c }) => c),
        sessions,
        shortcutError: shortcutError ?? null,
        shortcut: commands.find((c) => c.name === "toggle-annotations")?.shortcut ?? "",
      };
    }
    case "destinations":
      return navigator.locks.request("destination-names", async () => {
        const config = await getConfiguration();
        const connections = await getConnections();
        const names = new Map<string, string>();
        const pages = new Map<string, string>();
        for (const destination of config.destinations) {
          const connected = connections.find((c) => c.id === destination.connectionId);
          if (destination.pageName !== undefined || !connected) continue;
          const key = `${connected.id}:${destination.sourcePageId ?? destination.databaseId}`;
          let name = pages.get(key);
          if (name === undefined) {
            name = await new Notion(connected.token).destinationName(destination);
            pages.set(key, name);
          }
          names.set(destination.id, name);
        }
        if (!names.size) return config.destinations;
        const updated = await saveConfiguration((current) => ({
          ...current,
          destinations: current.destinations.map((d) =>
            names.has(d.id) ? { ...d, pageName: names.get(d.id)! } : d,
          ),
        }));
        return updated.destinations;
      });
    case "connect": {
      const api = new Notion(message.token);
      const info = await api.identify();
      await setConnection({ ...info, token: message.token });
      return info;
    }
    case "disconnect": {
      await removeConnection(message.id);
      return;
    }
    case "discover": {
      const api = new Notion((await connection(message.connectionId)).token);
      const result = await api.discover(message.url, message.connectionId);
      await rememberDestinations(result.destinations);
      return result;
    }
    case "prepare": {
      const api = new Notion((await connection(message.connectionId)).token);
      const destinations = await navigator.locks.request("prepare-notion", () =>
        api.prepare(message.pageId, message.connectionId),
      );
      await rememberDestinations(destinations);
      return destinations;
    }
    case "associate": {
      const config = await getConfiguration();
      if (!config.destinations.some((d) => d.id === message.association.destinationId))
        throw Error("Sélectionnez une base Notion.");
      return saveConfiguration((c) => ({
        ...c,
        associations: [
          ...c.associations.filter((a) => a.origin !== message.association.origin),
          message.association,
        ],
      }));
    }
    case "unlink":
      return saveConfiguration((c) => ({
        ...c,
        associations: c.associations.filter((a) => a.origin !== message.origin),
      }));
    case "import": {
      const incoming = message.configuration;
      return saveConfiguration((c) => ({
        ...c,
        destinations: [
          ...c.destinations.filter((d) => !incoming.destinations.some((n) => n.id === d.id)),
          ...incoming.destinations,
        ],
        associations: [
          ...c.associations.filter(
            (a) => !incoming.associations.some((n) => n.origin === a.origin),
          ),
          ...incoming.associations,
        ],
      }));
    }
    case "start":
      await browser.storage.session.remove("shortcutError");
      return summarize(await navigator.locks.request("start-session", () => start(message.tabId)));
    case "retry":
      return retry(message.id);
    case "delete-session":
      return navigator.locks.request("send-queue", async () => {
        const s = await getSession(message.id);
        if (s) {
          const active = await current(s.tabId);
          if (active?.id === s.id) await pause(s.tabId);
          await deleteSession(s.id);
        }
        return;
      });
    case "export-session": {
      const s = await getSession(message.id);
      if (!s) throw Error("Session introuvable.");
      return {
        ...sessionPayload(s),
        screenshots: s.annotations.map((a) => ({ id: a.id, dataUrl: a.screenshot })),
      };
    }
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) throw Error("Onglet introuvable.");
  const s = await current(tabId);
  if (message.type === "current")
    return s
      ? {
          ...summarize(s),
          annotations: s.annotations.map(({ screenshot: _screenshot, ...a }) => a),
        }
      : null;
  if (!s || s.status !== "draft") throw Error("Démarrez une session depuis l’extension.");
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).origin !== s.origin)
    throw Error("Le site a changé. Reprenez une session depuis l’extension.");
  switch (message.type) {
    case "capture":
      return navigator.locks.request(`capture:${tabId}`, async () => {
        const fresh = await getSession(s.id);
        if (fresh?.status !== "draft") throw Error("Cette session n’est plus modifiable.");
        if (fresh.annotations.length >= MAX_ANNOTATIONS)
          throw Error(`Envoyez ces ${MAX_ANNOTATIONS} annotations avant de continuer.`);
        if (new URL(message.target.url).origin !== s.origin)
          throw Error("La sélection appartient à un autre site.");
        const createdAt = new Date().toISOString();
        const screenshot = await capture(tabId, message.target);
        const pendingCapture = {
          id: crypto.randomUUID(),
          target: message.target,
          screenshot,
          createdAt,
        };
        await updateSession(s.id, (v) => ({ ...v, pendingCapture }));
        return pendingCapture.id;
      });
    case "add":
      await updateSession(s.id, (v) => {
        if (v.annotations.some((a) => a.id === message.captureId)) return v;
        if (v.status !== "draft" || v.pendingCapture?.id !== message.captureId)
          throw Error("Cette capture n’est plus disponible. Sélectionnez à nouveau le composant.");
        if (v.annotations.length >= MAX_ANNOTATIONS)
          throw Error(`Envoyez ces ${MAX_ANNOTATIONS} annotations avant de continuer.`);
        return {
          ...v,
          pendingCapture: undefined,
          annotations: [...v.annotations, { ...v.pendingCapture, body: message.body }],
        };
      });
      return;
    case "discard-capture":
      await updateSession(s.id, (v) =>
        v.pendingCapture?.id === message.captureId ? { ...v, pendingCapture: undefined } : v,
      );
      return;
    case "edit":
      await updateSession(s.id, (v) => ({
        ...v,
        annotations: v.annotations.map((a) =>
          a.id === message.annotationId ? { ...a, body: message.body } : a,
        ),
      }));
      return;
    case "remove":
      await updateSession(s.id, (v) => ({
        ...v,
        annotations: v.annotations.filter((a) => a.id !== message.annotationId),
      }));
      return;
    case "pause":
      return pause(tabId);
    case "submit": {
      const fresh = await getSession(s.id);
      if (!fresh?.annotations.length) throw Error("Ajoutez au moins une annotation.");
      await pause(tabId);
      await updateSession(s.id, (v) => ({ ...v, status: "queued", retryAt: 0 }));
      void processQueue();
      return { id: s.id };
    }
  }
}
