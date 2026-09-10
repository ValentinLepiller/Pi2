import { z } from "zod";
import { configurationSchema, type Configuration, type Connection } from "./models";
const empty: Configuration = { version: 1, destinations: [], associations: [] };
export async function getConfiguration(): Promise<Configuration> {
  const { configuration } = await chrome.storage.local.get("configuration");
  return configurationSchema.parse(configuration ?? empty);
}
export async function saveConfiguration(edit: (config: Configuration) => Configuration) {
  return navigator.locks.request("configuration", async () => {
    const config = configurationSchema.parse(edit(await getConfiguration()));
    await chrome.storage.local.set({ configuration: config });
    return config;
  });
}
export async function getConnections(): Promise<Connection[]> {
  const { connections } = await chrome.storage.local.get("connections");
  return z
    .array(z.object({ id: z.string(), name: z.string(), token: z.string() }))
    .parse(connections ?? []);
}
export async function connection(id: string) {
  const found = (await getConnections()).find((c) => c.id === id);
  if (!found) throw Error("Reconnectez Notion dans les réglages.");
  return found;
}
export async function setConnection(value: Connection) {
  return navigator.locks.request("connections", async () => {
    const connections = await getConnections();
    await chrome.storage.local.set({
      connections: [...connections.filter((c) => c.id !== value.id), value],
    });
  });
}
