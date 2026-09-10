import { browser } from "wxt/browser";
import axios, { type AxiosInstance } from "axios";
import { z } from "zod";
import { chunk } from "lodash-es";
import { connection } from "../lib/configuration";
import { getSession, updateSession } from "../lib/db";
import { notionId, type Annotation, type Destination, type Session } from "../lib/models";

const richText = z
  .array(
    z
      .object({
        plain_text: z.string().optional(),
        text: z.object({ content: z.string() }).optional(),
      })
      .passthrough(),
  )
  .default([]);
const databaseSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    title: richText,
    data_sources: z.array(z.object({ id: z.string(), name: z.string() })),
    parent: z.object({ page_id: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
const sourceSchema = z
  .object({
    id: z.string(),
    properties: z.record(z.string(), z.object({ id: z.string(), type: z.string() }).passthrough()),
  })
  .passthrough();
const pageSchema = z.object({ id: z.string(), url: z.string() }).passthrough();
const listSchema = z.object({
  results: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});
const uploadSchema = z.object({ id: z.string(), status: z.string() }).passthrough();
export const feedbackProperties = {
  Nom: { title: {} },
  Statut: {
    select: {
      options: [
        { name: "À traiter", color: "yellow" },
        { name: "En cours", color: "blue" },
        { name: "Terminé", color: "green" },
      ],
    },
  },
  Site: { url: {} },
  Environnement: { rich_text: {} },
  Date: { date: {} },
  Envoi: { rich_text: {} },
};
const requiredTypes: Record<string, string> = {
  Nom: "title",
  Statut: "select",
  Site: "url",
  Environnement: "rich_text",
  Date: "date",
  Envoi: "rich_text",
};
const text = (content: string) => [{ type: "text", text: { content } }];
const paragraph = (content: string) => ({
  object: "block",
  type: "paragraph",
  paragraph: { rich_text: text(content) },
});
const heading = (content: string) => ({
  object: "block",
  type: "heading_2",
  heading_2: { rich_text: text(content) },
});
const code = (content: string) => ({
  object: "block",
  type: "code",
  code: {
    language: "json",
    rich_text: chunk([...content], 1900).map((part) => ({
      type: "text",
      text: { content: part.join("") },
    })),
  },
});
const fileBlock = (id: string, name: string) => ({
  object: "block",
  type: "file",
  file: { type: "file_upload", file_upload: { id }, name, caption: [] },
});

export class NotionError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAt?: number,
  ) {
    super(message);
  }
}

export class Notion {
  private client: AxiosInstance;
  constructor(token: string) {
    this.client = axios.create({
      baseURL: "https://api.notion.com/v1",
      timeout: 30000,
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2025-09-03" },
    });
  }
  async call(method: string, url: string, data?: unknown): Promise<unknown> {
    return navigator.locks.request("notion-api", async () => {
      const { notionNextRequestAt } = await browser.storage.session.get("notionNextRequestAt");
      const delay = Math.max(
        0,
        (typeof notionNextRequestAt === "number" ? notionNextRequestAt : 0) - Date.now(),
      );
      // Persist long cooldowns instead of keeping the service worker asleep or sending too early.
      if (delay > 1000)
        throw new NotionError(
          "Notion demande de patienter avant de réessayer.",
          429,
          Date.now() + delay,
        );
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const result = await this.client.request({ method, url, data });
        return result.data;
      } catch (error) {
        if (!axios.isAxiosError(error)) throw Error("La requête Notion a échoué.");
        const status = error.response?.status;
        if (status === 429 || status === 529) {
          const retry = Math.max(1, Number(error.response?.headers["retry-after"]) || 60);
          const retryAt = Date.now() + retry * 1000;
          await browser.storage.session.set({ notionNextRequestAt: retryAt });
          throw new NotionError(
            "Notion est occupé. Votre envoi est conservé et sera réessayé.",
            status,
            retryAt,
          );
        }
        if (status === 401)
          throw new NotionError("Clé Notion invalide ou expirée. Reconnectez Notion.", status);
        if (status === 403 || status === 404)
          throw new NotionError(
            "Accès Notion indisponible. Ajoutez la connexion à cette page via le menu •••, puis Connexions, et vérifiez ses droits.",
            status,
          );
        if (status === 400) {
          const detail = z
            .object({ message: z.string().max(4000) })
            .safeParse(error.response?.data);
          throw new NotionError(
            detail.success
              ? `Notion a refusé cette requête : ${detail.data.message}`
              : "Notion a refusé cette requête. Vérifiez les informations saisies.",
            status,
          );
        }
        throw new NotionError(
          "Connexion à Notion interrompue. Votre envoi reste enregistré dans ce navigateur.",
          status,
        );
      } finally {
        const { notionNextRequestAt } = await browser.storage.session.get("notionNextRequestAt");
        await browser.storage.session.set({
          notionNextRequestAt: Math.max(
            typeof notionNextRequestAt === "number" ? notionNextRequestAt : 0,
            Date.now() + 350,
          ),
        });
      }
    });
  }
  async identify() {
    const value = z
      .object({
        id: z.string(),
        name: z.string().nullable().optional(),
        bot: z.object({ workspace_name: z.string().nullable().optional() }).optional(),
      })
      .passthrough()
      .parse(await this.call("GET", "/users/me"));
    return { id: value.id, name: value.bot?.workspace_name ?? value.name ?? "Notion" };
  }
  async dataSource(id: string) {
    return sourceSchema.parse(await this.call("GET", `/data_sources/${id}`));
  }
  async children(id: string) {
    const all: Record<string, unknown>[] = [];
    let cursor: string | null | undefined;
    do {
      const page = listSchema.parse(
        await this.call(
          "GET",
          `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
        ),
      );
      all.push(...page.results);
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);
    return all;
  }
  async destinationName(destination: Pick<Destination, "sourcePageId" | "name">): Promise<string> {
    if (!destination.sourcePageId) return destination.name;
    try {
      const page = z
        .object({ properties: z.record(z.string(), z.unknown()) })
        .parse(await this.call("GET", `/pages/${destination.sourcePageId}`));
      for (const property of Object.values(page.properties)) {
        const title = z.object({ title: richText }).safeParse(property);
        if (title.success) {
          const name = title.data.title
            .map((item) => item.plain_text ?? item.text?.content ?? "")
            .join("");
          if (name) return name;
        }
      }
      return destination.name;
    } catch (error) {
      if (error instanceof NotionError && [403, 404].includes(error.status ?? 0))
        return destination.name;
      throw error;
    }
  }
  async database(id: string, connectionId: string, sourcePageId?: string): Promise<Destination[]> {
    const db = databaseSchema.parse(await this.call("GET", `/databases/${id}`));
    const result: Destination[] = [];
    for (const source of db.data_sources) {
      const details = await this.dataSource(source.id);
      const missing = Object.entries(requiredTypes)
        .filter(([key, type]) => details.properties[key]?.type !== type)
        .map(([key]) => key);
      if (missing.length) continue;
      result.push({
        id: source.id,
        databaseId: db.id,
        dataSourceId: source.id,
        name:
          db.title.map((t) => t.plain_text ?? t.text?.content ?? "").join("") ||
          source.name ||
          "Feedbacks",
        url: db.url,
        connectionId,
        sourcePageId: sourcePageId ?? db.parent?.page_id,
      });
    }
    if (!result.length) return result;
    const pageName = await this.destinationName(result[0]!);
    return result.map((destination) => ({ ...destination, pageName }));
  }
  async discover(
    url: string,
    connectionId: string,
  ): Promise<{ destinations: Destination[]; pageId?: string; incompatible: boolean }> {
    const id = notionId(url);
    // A Notion link can identify a database or an ordinary page. Resolve via the API, not its DOM.
    try {
      const destinations = await this.database(id, connectionId);
      return { destinations, incompatible: destinations.length === 0 };
    } catch (error) {
      const isPage =
        error instanceof NotionError &&
        error.status === 400 &&
        /Provided database_id [0-9a-f-]+ is a page, not a database\./i.test(error.message);
      if (!(error instanceof NotionError) || (error.status !== 404 && !isPage)) throw error;
    }
    const page = pageSchema.parse(await this.call("GET", `/pages/${id}`));
    const children = await this.children(page.id);
    const destinations: Destination[] = [];
    for (const child of children)
      if (child.type === "child_database" && typeof child.id === "string")
        destinations.push(...(await this.database(child.id, connectionId, page.id)));
    return { destinations, pageId: page.id, incompatible: false };
  }
  async prepare(pageId: string, connectionId: string) {
    // Reuse an existing compatible child database after an uncertain create response.
    const existing = await this.discover(
      `https://www.notion.so/${pageId.replaceAll("-", "")}`,
      connectionId,
    );
    if (existing.destinations.length) return existing.destinations;
    const db = databaseSchema.parse(
      await this.call("POST", "/databases", {
        parent: { type: "page_id", page_id: pageId },
        title: text("Feedbacks"),
        is_inline: true,
        initial_data_source: { properties: feedbackProperties },
      }),
    );
    return this.database(db.id, connectionId, pageId);
  }
  async findSubmission(sourceId: string, id: string) {
    const list = listSchema.parse(
      await this.call("POST", `/data_sources/${sourceId}/query`, {
        filter: { property: "Envoi", rich_text: { equals: id } },
        page_size: 1,
      }),
    );
    return list.results[0] ? pageSchema.parse(list.results[0]) : undefined;
  }
  async upload(sessionId: string, key: string, blob: Blob, filename: string): Promise<string> {
    const s = await getSession(sessionId);
    if (!s) throw Error("Session introuvable.");
    let id = s.uploads[key];
    if (id) {
      try {
        const remote = uploadSchema.parse(await this.call("GET", `/file_uploads/${id}`));
        if (remote.status === "uploaded") return id;
        if (remote.status !== "pending") id = undefined;
      } catch (error) {
        if (!(error instanceof NotionError) || error.status !== 404) throw error;
        id = undefined;
      }
    }
    if (!id) {
      const upload = uploadSchema.parse(
        await this.call("POST", "/file_uploads", {
          mode: "single_part",
          filename,
          content_type: blob.type,
        }),
      );
      id = upload.id;
      const newId = id;
      await updateSession(sessionId, (s) => ({ ...s, uploads: { ...s.uploads, [key]: newId } }));
    }
    const form = new FormData();
    form.append("file", blob, filename);
    const sent = uploadSchema.parse(await this.call("POST", `/file_uploads/${id}/send`, form));
    if (sent.status !== "uploaded")
      throw Error("Le fichier Notion n’est pas encore prêt. Réessayez.");
    return id;
  }
}
export function sessionPayload(s: Session, annotations = s.annotations) {
  return {
    version: 1,
    id: s.id,
    site: s.origin,
    environment: s.environment,
    createdAt: s.createdAt,
    consoleStatus: s.consoleStatus,
    consoleReason: s.consoleReason,
    droppedLogs: s.droppedLogs,
    console: s.console,
    annotations: annotations.map(({ screenshot: _screenshot, ...a }) => ({
      ...a,
      screenshotFile: `annotation-${a.id}.png`,
    })),
  };
}
export async function exportToNotion(id: string) {
  const s = await getSession(id);
  if (!s) throw Error("Session introuvable.");
  const api = new Notion((await connection(s.destination.connectionId)).token);
  const schema = await api.dataSource(s.destination.dataSourceId);
  if (Object.entries(requiredTypes).some(([key, type]) => schema.properties[key]?.type !== type))
    throw Error("La structure de la base a changé. Restaurez les colonnes du modèle Feedbacks.");
  if (!s.annotations.length) throw Error("Aucun retour à envoyer.");
  // Finish an already-created legacy page after an interrupted upgrade, without duplicating it.
  if (s.notionPages === undefined) {
    const legacyPage = s.notionPageId
      ? { id: s.notionPageId, url: s.notionUrl! }
      : await api.findSubmission(s.destination.dataSourceId, s.id);
    if (legacyPage) return exportPage(api, s, s.annotations, s.id, legacyPage, true);
    await updateSession(id, (current) => ({ ...current, notionPages: {} }));
  }
  const urls: string[] = [];
  for (const annotation of s.annotations) {
    const submissionId = `${s.id}:${annotation.id}`;
    const page =
      s.notionPages?.[annotation.id] ??
      (await api.findSubmission(s.destination.dataSourceId, submissionId));
    urls.push(await exportPage(api, s, [annotation], submissionId, page));
  }
  return urls.length === 1 ? urls[0]! : s.destination.url;
}

async function exportPage(
  api: Notion,
  s: Session,
  annotations: Annotation[],
  submissionId: string,
  page?: { id: string; url: string },
  legacy = false,
) {
  const first = annotations[0]!;
  if (!page) {
    page = pageSchema.parse(
      await api.call("POST", "/pages", {
        parent: { type: "data_source_id", data_source_id: s.destination.dataSourceId },
        properties: {
          Nom: { title: text(first.body.slice(0, 100) || "Feedback") },
          Statut: { select: { name: "À traiter" } },
          Site: { url: legacy ? s.origin : first.target.url },
          Environnement: { rich_text: text(s.environment) },
          Date: { date: { start: legacy ? s.createdAt : first.createdAt } },
          Envoi: { rich_text: text(submissionId) },
        },
      }),
    );
  }
  const savedPage = { id: page.id, url: page.url };
  await updateSession(s.id, (current) =>
    legacy
      ? { ...current, notionPageId: savedPage.id, notionUrl: savedPage.url }
      : { ...current, notionPages: { ...current.notionPages, [first.id]: savedPage } },
  );
  const marker = legacy ? `vf-export-v1:${s.id}` : `vf-export-v2:${submissionId}`;
  const blocks = await api.children(page.id);
  if (blocks.some((b) => JSON.stringify(b).includes(marker))) return page.url;
  const content: unknown[] = [
    paragraph(`${annotations.length} annotation(s) · ${s.environment} · ${s.origin}`),
  ];
  for (const [index, a] of annotations.entries()) {
    const blob = await (await fetch(a.screenshot)).blob();
    const uploadId = await api.upload(s.id, a.id, blob, `annotation-${a.id}.png`);
    if (legacy) content.push(heading(`${index + 1}. ${a.body.slice(0, 120)}`));
    for (const part of chunk([...a.body], 1900)) content.push(paragraph(part.join("")));
    content.push({
      object: "block",
      type: "image",
      image: {
        type: "file_upload",
        file_upload: { id: uploadId },
        caption: text(legacy ? `Annotation ${index + 1}` : "Composant sélectionné"),
      },
    });
    content.push(code(JSON.stringify(a.target, null, 2)));
  }
  const payload = new Blob([JSON.stringify(sessionPayload(s, annotations), null, 2)], {
    type: "application/json",
  });
  if (payload.size > 5 * 1024 * 1024)
    throw Error("Le contexte dépasse 5 Mo. Exportez-le localement et réduisez la session.");
  const jsonId = await api.upload(
    s.id,
    legacy ? "context" : `context:${first.id}`,
    payload,
    "feedback-context.json",
  );
  content.push(
    heading("Console et contexte complet"),
    paragraph(
      `${s.console.length} événements conservés. ${s.droppedLogs} événements anciens écartés. Collecte : ${s.consoleStatus}.`,
    ),
    fileBlock(jsonId, "feedback-context.json"),
    paragraph(marker),
  );
  await api.call("PATCH", `/blocks/${page.id}/children`, { children: content });
  return page.url;
}
