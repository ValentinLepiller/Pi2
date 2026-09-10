import { z } from "zod";

export const originSchema = z.string().transform((input, ctx) => {
  try {
    const u = new URL(input);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw Error();
    return u.origin;
  } catch {
    ctx.addIssue({ code: "custom", message: "Saisissez une URL http ou https complète." });
    return z.NEVER;
  }
});
export const destinationSchema = z.object({
  id: z.string(),
  databaseId: z.string(),
  dataSourceId: z.string(),
  name: z.string(),
  url: z.string().url(),
  connectionId: z.string(),
  sourcePageId: z.string().optional(),
  pageName: z.string().optional(),
});
export type Destination = z.infer<typeof destinationSchema>;
export const associationSchema = z.object({
  origin: originSchema,
  destinationId: z.string(),
  environment: z.string().max(80).default("Staging"),
});
export type Association = z.infer<typeof associationSchema>;
export const configurationSchema = z.object({
  version: z.literal(1),
  destinations: z.array(destinationSchema).max(100),
  associations: z.array(associationSchema).max(500),
});
export type Configuration = z.infer<typeof configurationSchema>;
export type Connection = { id: string; name: string; token: string };
export type PublicConnection = Omit<Connection, "token">;
export const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const targetSchema = z.object({
  selector: z.string().max(4000),
  path: z.string().max(4000),
  tag: z.string().max(50),
  text: z.string().max(4000),
  nearbyText: z.string().max(4000),
  role: z.string().max(200),
  name: z.string().max(1000),
  rect: rectSchema,
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    dpr: z.number().positive(),
    scrollX: z.number(),
    scrollY: z.number(),
  }),
  url: z.string().url().max(8000),
  title: z.string().max(1000),
});
export type Target = z.infer<typeof targetSchema>;
export type Annotation = {
  id: string;
  body: string;
  target: Target;
  screenshot: string;
  createdAt: string;
};
export type ConsoleEntry = {
  level: string;
  text: string;
  timestamp: string;
  url?: string;
  stack?: string;
};
export type Session = {
  id: string;
  tabId: number;
  origin: string;
  destination: Destination;
  environment: string;
  createdAt: string;
  updatedAt: string;
  annotations: Annotation[];
  pendingCapture?: Omit<Annotation, "body">;
  console: ConsoleEntry[];
  consoleBytes?: number;
  droppedLogs: number;
  consoleStatus: "recording" | "unavailable" | "stopped";
  consoleReason?: string;
  status: "draft" | "queued" | "sending" | "failed" | "sent";
  error?: string;
  attempts: number;
  retryAt?: number;
  notionPageId?: string;
  notionPages?: Record<string, { id: string; url: string }>;
  notionUrl?: string;
  uploads: Record<string, string>;
  completedAt?: string;
};
export type SessionSummary = Omit<
  Session,
  "annotations" | "pendingCapture" | "console" | "uploads"
> & {
  annotationCount: number;
  logCount: number;
};
export function summarize(s: Session): SessionSummary {
  const { annotations, pendingCapture: _pending, console: logs, uploads: _uploads, ...rest } = s;
  return { ...rest, annotationCount: annotations.length, logCount: logs.length };
}
export function isNotionUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      ["notion.so", "notion.com", "notion.site"].some(
        (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    );
  } catch {
    return false;
  }
}

export function notionId(input: string): string {
  let text = input.trim();
  if (text.startsWith("http")) {
    const url = new URL(text);
    if (!isNotionUrl(text)) throw Error("Utilisez un lien Notion.");
    text = url.pathname;
  }
  const match = text.match(
    /([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i,
  );
  if (!match) throw Error("Ouvrez la base Notion en pleine page et copiez son lien.");
  const compact = match[1]!.replaceAll("-", "");
  return compact.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
}
export const MAX_ANNOTATIONS = 12;
export const MAX_LOGS = 1000;
export const MAX_CONSOLE_BYTES = 1024 * 1024;

export function destinationsForPage(destinations: Destination[], url: string) {
  try {
    const id = notionId(url);
    return destinations.filter((d) => d.databaseId === id || d.sourcePageId === id);
  } catch {
    return [];
  }
}
