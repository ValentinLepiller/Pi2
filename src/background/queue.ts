import { getSession, sessionSummaries, updateSession } from "../lib/db";
import { exportToNotion, NotionError } from "./notion";
export async function processQueue() {
  await navigator.locks.request("send-queue", { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    for (const queued of await sessionSummaries()) {
      if (!["queued", "sending"].includes(queued.status) || (queued.retryAt ?? 0) > Date.now())
        continue;
      await updateSession(queued.id, (s) => ({
        ...s,
        status: "sending",
        attempts: s.attempts + 1,
        error: undefined,
      }));
      try {
        const url = await exportToNotion(queued.id);
        await updateSession(queued.id, (s) => ({
          ...s,
          status: "sent",
          notionUrl: url,
          completedAt: new Date().toISOString(),
          retryAt: undefined,
        }));
      } catch (error) {
        const s = await getSession(queued.id);
        const exhausted = (s?.attempts ?? 0) >= 5;
        await updateSession(queued.id, (s) => ({
          ...s,
          status: exhausted ? "failed" : "queued",
          error: error instanceof Error ? error.message : "Envoi interrompu.",
          retryAt: Math.max(
            Date.now() + Math.min(30, 2 ** s.attempts) * 60000,
            error instanceof NotionError ? (error.retryAt ?? 0) : 0,
          ),
        }));
      }
    }
  });
}
export async function retry(id: string) {
  const s = await getSession(id);
  if (!s || s.status === "draft" || s.status === "sent")
    throw Error("Cet envoi ne peut pas être relancé.");
  await updateSession(id, (s) => ({
    ...s,
    status: "queued",
    attempts: 0,
    retryAt: 0,
    error: undefined,
  }));
  void processQueue();
}
