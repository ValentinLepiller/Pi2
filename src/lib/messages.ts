import { browser } from "wxt/browser";
import { z } from "zod";
import { associationSchema, configurationSchema, targetSchema } from "./models";
export const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state") }),
  z.object({ type: z.literal("destinations") }),
  z.object({ type: z.literal("connect"), token: z.string().trim().min(10).max(1000) }),
  z.object({ type: z.literal("disconnect"), id: z.string() }),
  z.object({ type: z.literal("discover"), connectionId: z.string(), url: z.string() }),
  z.object({ type: z.literal("prepare"), connectionId: z.string(), pageId: z.string() }),
  z.object({ type: z.literal("associate"), association: associationSchema }),
  z.object({ type: z.literal("unlink"), origin: z.string() }),
  z.object({ type: z.literal("import"), configuration: configurationSchema }),
  z.object({ type: z.literal("start"), tabId: z.number().int() }),
  z.object({ type: z.literal("current") }),
  z.object({
    type: z.literal("capture"),
    target: targetSchema,
  }),
  z.object({
    type: z.literal("add"),
    captureId: z.string(),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal("discard-capture"), captureId: z.string() }),
  z.object({
    type: z.literal("edit"),
    annotationId: z.string(),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal("remove"), annotationId: z.string() }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("retry"), id: z.string() }),
  z.object({ type: z.literal("delete-session"), id: z.string() }),
  z.object({ type: z.literal("export-session"), id: z.string() }),
]);
export type Message = z.infer<typeof messageSchema>;
export async function request<T = unknown>(message: Message): Promise<T> {
  const reply = await browser.runtime.sendMessage(message);
  if (!reply?.ok) throw Error(reply?.error ?? "Extension indisponible. Rechargez la page.");
  return reply.data as T;
}
export const contentCommands = new Set([
  "current",
  "capture",
  "add",
  "discard-capture",
  "edit",
  "remove",
  "pause",
  "submit",
]);
