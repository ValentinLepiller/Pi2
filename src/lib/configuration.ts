import { browser } from "wxt/browser";
import { openDB } from "idb";
import { z } from "zod";
import { configurationSchema, type Configuration, type Connection } from "./models";
// Firefox cannot restrict storage.local to trusted contexts. Its tokens stay on the extension origin.
const privateConnections = () =>
  openDB("pi2-private", 1, {
    upgrade(db) {
      db.createObjectStore("connections");
    },
  });
const empty: Configuration = { version: 1, destinations: [], associations: [] };
export async function getConfiguration(): Promise<Configuration> {
  const { configuration } = await browser.storage.local.get("configuration");
  return configurationSchema.parse(configuration ?? empty);
}
export async function saveConfiguration(edit: (config: Configuration) => Configuration) {
  return navigator.locks.request("configuration", async () => {
    const config = configurationSchema.parse(edit(await getConfiguration()));
    await browser.storage.local.set({ configuration: config });
    return config;
  });
}
export async function getConnections(): Promise<Connection[]> {
  let connections: unknown;
  if (import.meta.env.FIREFOX) {
    const db = await privateConnections();
    try {
      connections = await db.get("connections", "all");
    } finally {
      db.close();
    }
  } else {
    ({ connections } = await browser.storage.local.get("connections"));
  }
  return z
    .array(z.object({ id: z.string(), name: z.string(), token: z.string() }))
    .parse(connections ?? []);
}
export async function connection(id: string) {
  const found = (await getConnections()).find((c) => c.id === id);
  if (!found) throw Error("Reconnectez Notion dans les réglages.");
  return found;
}
async function changeConnections(edit: (connections: Connection[]) => Connection[]) {
  return navigator.locks.request("connections", async () => {
    const connections = edit(await getConnections());
    if (import.meta.env.FIREFOX) {
      const db = await privateConnections();
      try {
        await db.put("connections", connections, "all");
      } finally {
        db.close();
      }
    } else await browser.storage.local.set({ connections });
  });
}
export async function setConnection(value: Connection) {
  await changeConnections((connections) => [
    ...connections.filter((c) => c.id !== value.id),
    value,
  ]);
}
export async function removeConnection(id: string) {
  await changeConnections((connections) => connections.filter((c) => c.id !== id));
}
