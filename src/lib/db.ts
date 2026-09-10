import { openDB, type DBSchema } from "idb";
import { summarize, type Session, type SessionSummary } from "./models";
interface FeedbackDB extends DBSchema {
  sessions: { key: string; value: Session };
  summaries: { key: string; value: SessionSummary };
}
let database: ReturnType<typeof openDB<FeedbackDB>> | undefined;
function db() {
  // Keep the original database name so the Pi2 rename preserves existing drafts.
  return (database ??= openDB<FeedbackDB>("vals-feedbacks", 2, {
    async upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) db.createObjectStore("sessions", { keyPath: "id" });
      const summaries = db.createObjectStore("summaries", { keyPath: "id" });
      let cursor = await transaction.objectStore("sessions").openCursor();
      while (cursor) {
        await summaries.put(summarize(cursor.value));
        cursor = await cursor.continue();
      }
    },
  }));
}
export async function getSession(id: string) {
  return (await db()).get("sessions", id);
}
export async function sessionSummaries() {
  return (await (await db()).getAll("summaries")).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
export async function putSession(session: Session) {
  const tx = (await db()).transaction(["sessions", "summaries"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").put(session),
    tx.objectStore("summaries").put(summarize(session)),
    tx.done,
  ]);
}
export async function deleteSession(id: string) {
  const tx = (await db()).transaction(["sessions", "summaries"], "readwrite");
  await Promise.all([
    tx.objectStore("sessions").delete(id),
    tx.objectStore("summaries").delete(id),
    tx.done,
  ]);
}
export async function updateSession(id: string, edit: (s: Session) => Session) {
  return navigator.locks.request(`session:${id}`, async () => {
    const s = await getSession(id);
    if (!s) throw Error("Session introuvable.");
    const next = edit(s);
    if (next === s) return s;
    next.updatedAt = new Date().toISOString();
    await putSession(next);
    return next;
  });
}
