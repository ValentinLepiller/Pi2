import { test, expect, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const pageId = "11111111-1111-1111-1111-111111111111";
const databaseId = "22222222-2222-2222-2222-222222222222";
const sourceId = "33333333-3333-3333-3333-333333333333";
const testToken = "ntn_fixture_only_not_a_real_token";
type FakeNotion = {
  created: boolean;
  pages: Array<{ id: string; url: string; properties: unknown }>;
  blocks: Record<string, unknown[]>;
  uploads: Record<string, { status: string; filename: string; body?: Buffer }>;
  offline: boolean;
  failAppendAfterWrite: boolean;
  failCreateAfterWrite?: boolean;
  requests: number;
  rateLimitSeconds?: number;
};
async function mockNotion(context: BrowserContext, existing?: FakeNotion): Promise<FakeNotion> {
  const fake: FakeNotion = existing ?? {
    created: false,
    pages: [],
    blocks: {},
    uploads: {},
    offline: false,
    failAppendAfterWrite: false,
    requests: 0,
  };
  await context.route("https://api.notion.com/**", async (route) => {
    const request = route.request();
    fake.requests++;
    if (fake.rateLimitSeconds) {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": String(fake.rateLimitSeconds) },
        json: { object: "error", message: "rate limited" },
      });
      return;
    }
    if (fake.offline) {
      await route.fulfill({
        status: 503,
        json: { object: "error", message: "fixture unavailable" },
      });
      return;
    }
    expect(request.headers().authorization).toBe(`Bearer ${testToken}`);
    const path = new URL(request.url()).pathname.replace("/v1", "");
    const method = request.method();
    const db = {
      object: "database",
      id: databaseId,
      url: `https://www.notion.so/${databaseId}`,
      title: [{ plain_text: "Feedbacks Atelier" }],
      data_sources: [{ id: sourceId, name: "Feedbacks" }],
      parent: { type: "page_id", page_id: pageId },
    };
    const properties = Object.fromEntries(
      Object.entries({
        Nom: "title",
        Statut: "select",
        Site: "url",
        Environnement: "rich_text",
        Date: "date",
        Envoi: "rich_text",
      }).map(([name, type]) => [name, { id: name, type }]),
    );
    let response: unknown = {};
    let status = 200;
    if (path === "/users/me")
      response = {
        object: "user",
        id: "fixture-bot",
        name: "Feedbacks",
        bot: { workspace_name: "Atelier · Tests" },
      };
    else if (path === `/databases/${databaseId}` && fake.created) response = db;
    else if (path === `/databases/${pageId}`) {
      status = 400;
      response = {
        object: "error",
        code: "validation_error",
        message: `Provided database_id ${pageId} is a page, not a database. Use the pages API instead, or pass the ID of the database itself.`,
      };
    } else if (path.startsWith("/databases/")) {
      status = 404;
      response = { object: "error" };
    } else if (path === `/pages/${pageId}`)
      response = {
        id: pageId,
        url: `https://www.notion.so/${pageId}`,
        properties: { title: { type: "title", title: [{ plain_text: "Pi2" }] } },
      };
    else if (path === "/databases" && method === "POST") {
      const data = request.postDataJSON();
      expect(data.initial_data_source.properties.Envoi).toBeDefined();
      fake.created = true;
      response = db;
    } else if (path === `/data_sources/${sourceId}`) response = { id: sourceId, properties };
    else if (path === `/data_sources/${sourceId}/query`) {
      const submissionId = request.postDataJSON().filter.rich_text.equals;
      response = {
        results: fake.pages.filter((page) => {
          const properties = page.properties as {
            Envoi: { rich_text: Array<{ text: { content: string } }> };
          };
          return properties.Envoi.rich_text.some((part) => part.text.content === submissionId);
        }),
        has_more: false,
      };
    } else if (path === "/pages" && method === "POST") {
      const item = {
        id: `44444444-4444-4444-4444-${String(fake.pages.length).padStart(12, "0")}`,
        url: "https://www.notion.so/feedback-fixture",
        properties: request.postDataJSON().properties,
      };
      fake.pages.push(item);
      if (fake.failCreateAfterWrite) {
        fake.failCreateAfterWrite = false;
        await route.abort();
        return;
      }
      response = item;
    } else if (path === "/file_uploads" && method === "POST") {
      const id = `upload-${Object.keys(fake.uploads).length}`;
      fake.uploads[id] = { status: "pending", filename: request.postDataJSON().filename };
      response = { id, status: "pending" };
    } else if (path.startsWith("/file_uploads/")) {
      const id = path.split("/")[2]!;
      const file = fake.uploads[id]!;
      if (method === "POST") {
        file.status = "uploaded";
        file.body = request.postDataBuffer() ?? undefined;
      }
      response = { id, status: file.status };
    } else if (path.startsWith("/blocks/")) {
      const id = path.split("/")[2]!;
      if (method === "PATCH") {
        fake.blocks[id] = [...(fake.blocks[id] ?? []), ...request.postDataJSON().children];
        response = { results: fake.blocks[id] };
        if (fake.failAppendAfterWrite) {
          fake.failAppendAfterWrite = false;
          await route.abort();
          return;
        }
      } else
        response = {
          results:
            id === pageId && fake.created
              ? [{ type: "child_database", id: databaseId }]
              : (fake.blocks[id] ?? []),
          has_more: false,
        };
    } else throw Error(`Unexpected Notion request ${method} ${path}`);
    await route.fulfill({ status, json: response });
  });
  return fake;
}
async function launch(existingProfile?: string, deviceScaleFactor = 1) {
  const profile = existingProfile ?? (await mkdtemp(resolve(tmpdir(), "vf-e2e-")));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor,
    args: [
      `--force-device-scale-factor=${deviceScaleFactor}`,
      `--disable-extensions-except=${resolve(".output/chrome-mv3")}`,
      `--load-extension=${resolve(".output/chrome-mv3")}`,
      "--host-resolver-rules=MAP api.notion.com ~NOTFOUND",
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  return { context, worker, id, profile };
}

async function openPopup(context: BrowserContext, worker: Worker, id: string) {
  const pagePromise = context.waitForEvent("page");
  await worker.evaluate(
    async (id) => chrome.tabs.create({ url: `chrome-extension://${id}/popup.html`, active: false }),
    id,
  );
  const popup = await pagePromise;
  await popup.waitForLoadState();
  return popup;
}
test("envoyer chaque retour dans sa page Notion et reprendre sans doublon après des réponses perdues", async () => {
  const { context, worker, id, profile } = await launch();
  try {
    const fake = await mockNotion(context);
    const unlinkedSite = await context.newPage();
    await unlinkedSite.goto("http://127.0.0.1:4319");
    const unlinkedPopup = await openPopup(context, worker, id);
    await expect(unlinkedPopup.getByRole("heading", { name: "Connecter Notion" })).toBeVisible();
    await expect(
      unlinkedPopup.getByRole("button", { name: "Commencer les annotations" }),
    ).toHaveCount(0);
    await expect(unlinkedPopup.getByLabel("Jeton Notion")).toBeVisible();
    await unlinkedPopup.getByLabel("Jeton Notion").fill(testToken);
    await unlinkedPopup.getByRole("button", { name: "Vérifier et connecter" }).click();
    await expect(unlinkedPopup.getByLabel("Envoyer les feedbacks à")).toBeDisabled();
    const connectedState = await unlinkedPopup.evaluate(() =>
      chrome.runtime.sendMessage({ type: "state" }),
    );
    await unlinkedPopup.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "disconnect", id }),
      connectedState.data.connections[0].id,
    );
    await expect(unlinkedPopup.getByLabel("Jeton Notion")).toBeVisible();
    await unlinkedPopup.setViewportSize({ width: 50, height: 600 });
    expect(
      await unlinkedPopup.locator(".popup").evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(420);
    await unlinkedPopup.setViewportSize({ width: 420, height: 600 });
    await expect(unlinkedPopup.getByRole("link", { name: "Connecter Notion" })).toHaveAttribute(
      "href",
      "https://www.notion.so/developers/tokens",
    );
    await unlinkedPopup.locator(".popup").screenshot({ path: "test-results/site-popup.png" });
    await unlinkedPopup.close();
    await unlinkedSite.close();
    await context.route(/^https:\/\/www\.notion\.(so|com)\//, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><title>Notion · page de test</title></html>",
      }),
    );
    const notion = await context.newPage();
    await notion.goto(
      `https://www.notion.com/p/team/Pi2-${pageId.replaceAll("-", "")}?showMoveTo=true&saveParent=true`,
    );
    const options = await openPopup(context, worker, id);
    const errors: string[] = [];
    options.on("pageerror", (e) => errors.push(e.message));
    await options.getByLabel("Jeton Notion").fill(testToken);
    await options.getByRole("button", { name: "Vérifier et connecter" }).click();
    await expect(options.getByText("Atelier · Tests", { exact: true })).toBeVisible();
    await options.getByRole("button", { name: "Vérifier la page" }).click();
    await options.getByRole("button", { name: "Créer la base Feedbacks ici" }).click();
    await expect(options.getByText("Feedbacks Atelier", { exact: true })).toHaveCount(0);
    await options.getByLabel("URL du site", { exact: true }).fill("http://127.0.0.1:4319/products");
    await options.getByRole("button", { name: "Lier ce site" }).click();
    await expect(options.getByRole("status")).toContainText("http://127.0.0.1:4319");
    await options.locator(".popup").screenshot({ path: "test-results/notion-popup.png" });
    await expect(
      options.getByRole("button", { name: /Sites associés|Mes envois|Guide/ }),
    ).toHaveCount(0);
    expect(await worker.evaluate(() => chrome.runtime.getManifest().options_ui)).toBeUndefined();
    await notion.goto("https://www.notion.so/developers/tokens");
    const portalPopup = await openPopup(context, worker, id);
    await expect(
      portalPopup.getByText("Ouvrez la page ou la base Notion", { exact: false }),
    ).toBeVisible();
    await portalPopup.close();
    await notion.close();
    const site = await context.newPage();
    await site.goto("http://127.0.0.1:4319");
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ url: "http://127.0.0.1:4319/*" }))[0]!.id!,
    );
    // Existing installations resolve page names once; selection works on a site without a mapping.
    await options.evaluate(async () => {
      const state = await chrome.runtime.sendMessage({ type: "state" });
      const first = state.data.configuration.destinations[0];
      const { pageName: _pageName, ...legacy } = first;
      await chrome.runtime.sendMessage({
        type: "import",
        configuration: {
          version: 1,
          destinations: [
            legacy,
            {
              ...first,
              id: "other-source",
              dataSourceId: "other-source",
              pageName: "Autre projet",
            },
          ],
          associations: [],
        },
      });
      await chrome.runtime.sendMessage({ type: "unlink", origin: "http://127.0.0.1:4319" });
    });
    const destinationPopup = await openPopup(context, worker, id);
    const destinationChoice = destinationPopup.getByLabel("Envoyer les feedbacks à");
    await expect(destinationChoice.getByRole("option", { name: "Pi2", exact: true })).toHaveCount(
      1,
    );
    await expect(
      destinationChoice.getByRole("option", { name: "Autre projet", exact: true }),
    ).toHaveCount(1);
    await expect(
      destinationPopup.getByRole("button", { name: "Commencer les annotations" }),
    ).toBeDisabled();
    await destinationChoice.selectOption(sourceId);
    await destinationPopup
      .locator(".popup")
      .screenshot({ path: "test-results/destination-popup.png" });
    await destinationPopup.getByRole("button", { name: "Commencer les annotations" }).click();
    await expect
      .poll(
        async () =>
          (await options.evaluate(() => chrome.runtime.sendMessage({ type: "state" }))).data
            .configuration.associations[0]?.destinationId,
      )
      .toBe(sourceId);
    await site.bringToFront();
    const overlay = site.locator("pi2-annotator");
    await expect(overlay.getByText("Console active", { exact: false })).toBeVisible();
    // Console events are captured by the real Chromium debugger.
    await overlay.getByRole("button", { name: "Annoter", exact: true }).click();
    await site.locator("#checkout").click();
    await overlay.getByRole("button", { name: "Naviguer", exact: true }).click();
    await site.locator("#checkout").click();
    await overlay
      .getByLabel("Commentaire", { exact: true })
      .fill("Le bouton ne fonctionne pas. Agrandir aussi son libellé.");
    await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
    await expect(overlay.getByLabel("Modifier l’annotation 1")).toBeVisible();
    await site.screenshot({ path: "test-results/annotation.png" });
    const rememberedPopup = await openPopup(context, worker, id);
    await expect(rememberedPopup.getByLabel("Envoyer les feedbacks à")).toHaveValue(sourceId);
    await rememberedPopup.close();
    // The site's content-script context cannot read credentials or call privileged commands.
    const security = await worker.evaluate(async (tabId) => {
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          let tokenReadable = false;
          try {
            const v = await chrome.storage.local.get("connections");
            tokenReadable = Boolean(v.connections);
          } catch {}
          const reply = await chrome.runtime.sendMessage({ type: "state" });
          return { tokenReadable, reply };
        },
      });
      return result[0]!.result;
    }, tabId);
    expect(security?.tokenReadable).toBe(false);
    expect(security?.reply.ok).toBe(false);
    // Reload loses the overlay but the draft remains available.
    await site.reload();
    const resume = await options.evaluate(
      async (tabId) => chrome.runtime.sendMessage({ type: "start", tabId }),
      tabId,
    );
    expect(resume.ok).toBe(true);
    await expect(site.locator("pi2-annotator").getByLabel("Modifier l’annotation 1")).toBeVisible();
    await site.locator("#shadow-button").click();
    const secondBody = "Renforcer le contraste du bouton secondaire.";
    await overlay.getByLabel("Commentaire", { exact: true }).fill(secondBody);
    await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
    await expect(overlay.getByLabel("Modifier l’annotation 2")).toBeVisible();
    fake.offline = true;
    await site
      .locator("pi2-annotator")
      .getByRole("button", { name: "Envoyer 2", exact: true })
      .click();
    const deliveryPopup = await openPopup(context, worker, id);
    await expect(deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" })).toBeVisible();
    await expect(deliveryPopup.getByLabel("Jeton Notion")).toHaveCount(0);
    const state = await options.evaluate(async () => chrome.runtime.sendMessage({ type: "state" }));
    const sessionId = state.data.sessions[0].id;
    const exported = await options.evaluate(
      async (id) => chrome.runtime.sendMessage({ type: "export-session", id }),
      sessionId,
    );
    expect(exported.data.annotations[0].target.selector).toBe("#checkout");
    expect(exported.data.screenshots[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(
      exported.data.console.some((e: { text: string }) => e.text.includes("checkout failed")),
    ).toBe(true);
    expect(JSON.stringify(exported)).not.toContain(testToken);
    // Simulate a network failure after Notion saved the blocks. Retry must reconcile, not append twice.
    fake.offline = false;
    fake.failCreateAfterWrite = true;
    fake.failAppendAfterWrite = true;
    await deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" }).click();
    await expect.poll(() => fake.pages.length).toBe(1);
    await expect(deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" })).toBeEnabled();
    await deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" }).click();
    await expect.poll(() => Object.keys(fake.blocks).length, { timeout: 40000 }).toBe(1);
    await expect(deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" })).toBeEnabled();
    await deliveryPopup.getByRole("button", { name: "Réessayer l’envoi" }).click();
    await expect
      .poll(
        async () =>
          (await options.evaluate(() => chrome.runtime.sendMessage({ type: "state" }))).data
            .sessions[0].status,
      )
      .toBe("sent");
    expect(fake.pages).toHaveLength(2);
    expect(Object.values(fake.uploads)).toHaveLength(4);
    for (const [index, page] of fake.pages.entries()) {
      const annotation = exported.data.annotations[index];
      const other = exported.data.annotations[1 - index];
      const properties = page.properties as {
        Nom: { title: Array<{ text: { content: string } }> };
        Site: { url: string };
      };
      expect(properties.Nom.title[0]!.text.content).toBe(annotation.body.slice(0, 100));
      expect(properties.Site.url).toBe(annotation.target.url);
      const blocks = fake.blocks[page.id]!;
      expect(
        blocks.filter((b) =>
          JSON.stringify(b).includes(`vf-export-v2:${sessionId}:${annotation.id}`),
        ),
      ).toHaveLength(1);
      expect(blocks.filter((b) => (b as { type: string }).type === "image")).toHaveLength(1);
      expect(JSON.stringify(blocks)).toContain(annotation.body);
      expect(JSON.stringify(blocks)).not.toContain(other.body);
      const file = blocks.find((b) => (b as { type: string }).type === "file") as {
        file: { file_upload: { id: string } };
      };
      const json = fake.uploads[file.file.file_upload.id]!;
      expect(json.body?.includes(Buffer.from(annotation.body))).toBe(true);
      expect(json.body?.includes(Buffer.from(other.body))).toBe(false);
      expect(json.body?.includes(Buffer.from("checkout failed"))).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("modifier et supprimer dans un Shadow DOM, puis reprendre après fermeture de Chromium", async () => {
  const first = await launch();
  let context = first.context;
  try {
    const fake = await mockNotion(context);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${first.id}/popup.html`);
    const setup = await options.evaluate(
      async ({ testToken, pageId }) => {
        const connected = await chrome.runtime.sendMessage({ type: "connect", token: testToken });
        const prepared = await chrome.runtime.sendMessage({
          type: "prepare",
          connectionId: connected.data.id,
          pageId,
        });
        const linked = await chrome.runtime.sendMessage({
          type: "associate",
          association: {
            origin: "http://127.0.0.1:4319",
            destinationId: prepared.data[0].id,
            environment: "Staging",
          },
        });
        return [connected.ok, prepared.ok, linked.ok];
      },
      { testToken, pageId },
    );
    expect(setup).toEqual([true, true, true]);
    const site = await context.newPage();
    await site.goto("http://127.0.0.1:4319");
    const tabId = await first.worker.evaluate(
      async () => (await chrome.tabs.query({ url: "http://127.0.0.1:4319/*" }))[0]!.id!,
    );
    await options.evaluate(
      async (tabId) => chrome.runtime.sendMessage({ type: "start", tabId }),
      tabId,
    );
    const overlay = site.locator("pi2-annotator");
    await expect(overlay.getByText("Console active", { exact: false })).toBeVisible();
    await site.locator("#shadow-button").click();
    await overlay.getByLabel("Commentaire", { exact: true }).fill("Le contraste est trop faible.");
    await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
    await overlay.getByLabel("Modifier l’annotation 1").click();
    await overlay
      .getByLabel("Commentaire", { exact: true })
      .fill("Renforcer le contraste de ce bouton.");
    await overlay.getByRole("button", { name: "Enregistrer", exact: false }).click();
    await expect(overlay.getByLabel("Commentaire", { exact: true })).toHaveCount(0);
    await site.locator("#checkout").click();
    await overlay.getByLabel("Commentaire", { exact: true }).fill("Annotation à retirer.");
    await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
    await overlay.getByLabel("Modifier l’annotation 2").click();
    await overlay.getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(overlay.getByLabel("Modifier l’annotation 2")).toHaveCount(0);
    await overlay.getByLabel("Mettre en pause").click();
    await expect(overlay).toHaveCount(0);
    await context.close();

    const second = await launch(first.profile);
    context = second.context;
    await mockNotion(context, fake);
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${second.id}/popup.html`);
    const state = await settings.evaluate(async () =>
      chrome.runtime.sendMessage({ type: "state" }),
    );
    expect(state.data.sessions[0].annotationCount).toBe(1);
    const sessionId = state.data.sessions[0].id;
    const exported = await settings.evaluate(
      async (id) => chrome.runtime.sendMessage({ type: "export-session", id }),
      sessionId,
    );
    expect(exported.data.annotations[0].body).toBe("Renforcer le contraste de ce bouton.");
    expect(exported.data.annotations[0].target.selector).toBe("#shadow-host >>> #shadow-button");
    const resumedSite = await context.newPage();
    await resumedSite.goto("http://127.0.0.1:4319");
    const resumedTab = await second.worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!,
    );
    const resumed = await settings.evaluate(
      async (tabId) => chrome.runtime.sendMessage({ type: "start", tabId }),
      resumedTab,
    );
    expect(resumed.ok).toBe(true);
    expect(resumed.data.id).toBe(sessionId);
    await expect(
      resumedSite.locator("pi2-annotator").getByLabel("Modifier l’annotation 1"),
    ).toBeVisible();
  } finally {
    await context.close();
    await rm(first.profile, { recursive: true, force: true });
  }
});

test("respecter Retry-After même lorsque l’utilisateur réessaie immédiatement", async () => {
  const { context, profile, id } = await launch();
  try {
    const fake = await mockNotion(context);
    fake.rateLimitSeconds = 1200;
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/popup.html`);
    const first = await options.evaluate(
      async (token) => chrome.runtime.sendMessage({ type: "connect", token }),
      testToken,
    );
    expect(first.ok).toBe(false);
    expect(first.error).toContain("Notion est occupé");
    const second = await options.evaluate(
      async (token) => chrome.runtime.sendMessage({ type: "connect", token }),
      testToken,
    );
    expect(second.ok).toBe(false);
    expect(second.error).toContain("Notion demande de patienter");
    expect(fake.requests).toBe(1);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("capturer uniquement le composant sans interface Pi2, même après défilement ou partiellement hors écran", async () => {
  const { context, worker, id, profile } = await launch(undefined, 2);
  try {
    await mockNotion(context);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/popup.html`);
    const configured = await options.evaluate(
      async ({ testToken, pageId }) => {
        const connected = await chrome.runtime.sendMessage({ type: "connect", token: testToken });
        const prepared = await chrome.runtime.sendMessage({
          type: "prepare",
          connectionId: connected.data.id,
          pageId,
        });
        const linked = await chrome.runtime.sendMessage({
          type: "associate",
          association: {
            origin: "http://127.0.0.1:4319",
            destinationId: prepared.data[0].id,
            environment: "Test",
          },
        });
        return connected.ok && prepared.ok && linked.ok;
      },
      { testToken, pageId },
    );
    expect(configured).toBe(true);
    const site = await context.newPage();
    await site.goto("http://127.0.0.1:4319");
    // A uniform component makes every overlay pixel visible in the exported image.
    await site.evaluate(() => {
      const component = document.createElement("div");
      component.id = "capture-component";
      component.style.cssText =
        "position:absolute;left:110px;top:1200px;width:900px;height:360px;background:rgb(112,64,176);";
      document.body.append(component);
      document.body.style.minHeight = "2600px";
      window.scrollTo(0, 1000);
    });
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ url: "http://127.0.0.1:4319/*" }))[0]!.id!,
    );
    const started = await options.evaluate(
      async (tabId) => chrome.runtime.sendMessage({ type: "start", tabId }),
      tabId,
    );
    expect(started.ok).toBe(true);
    const overlay = site.locator("pi2-annotator");
    await expect(overlay.getByText("Console active", { exact: false })).toBeVisible();
    for (const clipped of [false, true]) {
      if (clipped) {
        await site.evaluate(() => {
          document.querySelector<HTMLElement>("#capture-component")!.style.top = "970px";
        });
      }
      // Click without auto-scrolling the partially visible component into view.
      await site.mouse.click(130, clipped ? 40 : 240);
      await overlay.getByLabel("Commentaire", { exact: true }).fill("Vérifier ce composant.");
      await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
      await expect(overlay.getByLabel(`Modifier l’annotation ${clipped ? 2 : 1}`)).toBeVisible();
      const exported = await options.evaluate(
        async (sessionId) => chrome.runtime.sendMessage({ type: "export-session", id: sessionId }),
        started.data.id,
      );
      const dataUrl = exported.data.screenshots.at(-1).dataUrl;
      const pixels = await options.evaluate(async (url) => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let altered = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 112 || data[i + 1] !== 64 || data[i + 2] !== 176 || data[i + 3] !== 255)
            altered++;
        }
        const result = { width: bitmap.width, height: bitmap.height, altered };
        bitmap.close();
        return result;
      }, dataUrl);
      expect(pixels).toEqual({ width: 1600, height: clipped ? 587 : 640, altered: 0 });
      await writeFile(
        `test-results/component-${clipped ? "clipped" : "capture"}.png`,
        Buffer.from(dataUrl.split(",")[1], "base64"),
      );
    }
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
