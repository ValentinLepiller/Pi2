import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.env.DISPLAY || process.env.DISPLAY === process.env.PI2_ORIGINAL_DISPLAY) {
  throw Error("Le test du raccourci exige un affichage Xvfb isolé.");
}
const profile = await mkdtemp("/tmp/pi2-shortcut-");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  executablePath: process.env.PI2_TEST_BROWSER_BINARY,
  headless: false,
  viewport: null,
  env: { ...process.env, WAYLAND_DISPLAY: "", XDG_SESSION_TYPE: "x11" },
  args: [
    "--ozone-platform=x11",
    `--disable-extensions-except=${resolve(".output/chrome-mv3")}`,
    `--load-extension=${resolve(".output/chrome-mv3")}`,
    "--host-resolver-rules=MAP api.notion.com ~NOTFOUND",
  ],
});
try {
  await context.route("https://api.notion.com/**", async (route) => {
    expect(new URL(route.request().url()).pathname).toBe("/v1/users/me");
    await route.fulfill({ json: { id: "shortcut-user", name: "Tests raccourci" } });
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const site = await context.newPage();
  await site.goto("http://127.0.0.1:4319");
  const cdp = await context.newCDPSession(site);
  const popupTargets = async () =>
    (await cdp.send("Target.getTargets")).targetInfos.filter(
      (target) => target.url === `chrome-extension://${extensionId}/popup.html`,
    );
  async function shortcut() {
    await site.bringToFront();
    await worker.evaluate(async () => {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!;
      await chrome.windows.update(tab.windowId, { focused: true });
    });
    await expect
      .poll(() => worker.evaluate(async () => (await chrome.windows.getAll())[0]?.focused))
      .toBe(true);
    const windowId = execFileSync("xdotool", [
      "search",
      "--onlyvisible",
      "--name",
      "Atelier — Boutique de test",
    ])
      .toString()
      .trim()
      .split("\n")[0]!;
    execFileSync("xdotool", ["windowfocus", "--sync", windowId]);
    await expect.poll(() => site.evaluate(() => document.hasFocus())).toBe(true);
    // Allow Chromium to process each modifier transition before the next key.
    execFileSync("xdotool", ["key", "--clearmodifiers", "--delay", "100", "ctrl+period"]);
  }
  async function closePopup() {
    // Xvfb has no window manager to transfer keyboard focus to the native popup.
    for (const target of await popupTargets()) {
      await cdp.send("Target.closeTarget", { targetId: target.targetId });
    }
    await expect.poll(async () => (await popupTargets()).length).toBe(0);
  }
  const commands = await worker.evaluate(() => chrome.commands.getAll());
  expect(commands.find((command) => command.name === "toggle-annotations")?.shortcut).toBe(
    "Ctrl+Period",
  );
  await shortcut();
  await expect
    .poll(async () => (await popupTargets()).length, {
      message: "Le raccourci doit ouvrir la popup native",
    })
    .toBe(1);
  await closePopup();

  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${extensionId}/popup.html?test-setup`);
  const configured = await setup.evaluate(async () => {
    const connected = await chrome.runtime.sendMessage({
      type: "connect",
      token: "ntn_shortcut_fixture_only",
    });
    const imported = await chrome.runtime.sendMessage({
      type: "import",
      configuration: {
        version: 1,
        associations: [],
        destinations: [
          {
            id: "shortcut-source",
            databaseId: "shortcut-database",
            dataSourceId: "shortcut-source",
            name: "Feedbacks",
            pageName: "Projet de test",
            url: "https://www.notion.so/shortcut",
            connectionId: connected.data.id,
          },
        ],
      },
    });
    return connected.ok && imported.ok;
  });
  expect(configured).toBe(true);
  // A valid token alone must not choose a destination on the user's behalf.
  await shortcut();
  await expect
    .poll(async () => (await popupTargets()).length, {
      message: "Le raccourci doit ouvrir la popup native",
    })
    .toBe(1);
  await closePopup();
  await expect(site.locator("pi2-annotator")).toHaveCount(0);
  await setup.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "associate",
      association: {
        origin: "http://127.0.0.1:4319",
        destinationId: "shortcut-source",
        environment: "Test",
      },
    }),
  );

  await shortcut();
  const overlay = site.locator("pi2-annotator");
  await expect(overlay.getByText("Console active", { exact: false })).toBeVisible();
  await site.locator("#checkout").click();
  await overlay
    .getByLabel("Commentaire", { exact: true })
    .fill("Conserver ce retour pendant la pause.");
  await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
  await expect(overlay.getByLabel("Modifier l’annotation 1")).toBeVisible();
  const state = await setup.evaluate(() => chrome.runtime.sendMessage({ type: "state" }));
  const sessionId = state.data.sessions[0].id;
  await shortcut();
  await expect(overlay).toHaveCount(0);
  const paused = await setup.evaluate(() => chrome.runtime.sendMessage({ type: "state" }));
  expect(paused.data.sessions[0].annotationCount).toBe(1);
  expect(paused.data.sessions[0].consoleStatus).toBe("stopped");

  await shortcut();
  await expect(overlay.getByLabel("Modifier l’annotation 1")).toBeVisible();
  const resumed = await setup.evaluate(() => chrome.runtime.sendMessage({ type: "state" }));
  expect(resumed.data.sessions[0].id).toBe(sessionId);
  await site.reload();
  await expect(overlay).toHaveCount(0);
  await shortcut();
  await expect(overlay.getByLabel("Modifier l’annotation 1")).toBeVisible();
  // The native shortcut grants activeTab, so capture still works with DevTools/console detached.
  await worker.evaluate(
    async (tabId) => chrome.debugger.detach({ tabId }),
    state.data.sessions[0].tabId,
  );
  await site.locator("#checkout").click();
  await overlay.getByLabel("Commentaire", { exact: true }).fill("Capture sans collecte console.");
  await overlay.getByRole("button", { name: "Ajouter", exact: false }).click();
  await expect(overlay.getByLabel("Modifier l’annotation 2")).toBeVisible();
  const exported = await setup.evaluate(
    async (id) => chrome.runtime.sendMessage({ type: "export-session", id }),
    sessionId,
  );
  const dimensions = await setup.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  }, exported.data.screenshots[1].dataUrl);
  const target = exported.data.annotations[1].target;
  expect(dimensions.width).toBeLessThan(target.viewport.width / 2);
  expect(
    Math.abs(dimensions.width / dimensions.height - target.rect.width / target.rect.height),
  ).toBeLessThan(0.1);
  await shortcut();
  await expect(overlay).toHaveCount(0);
  // Chromium may leave the suggested binding empty after installation or a conflict.
  const shortcutsPage = await context.newPage();
  await shortcutsPage.goto("chrome://extensions/shortcuts");
  await shortcutsPage.evaluate(async (id) => {
    await new Promise<void>((resolve) =>
      (chrome as any).developerPrivate.updateExtensionCommand(
        { extensionId: id, commandName: "toggle-annotations", keybinding: "" },
        resolve,
      ),
    );
  }, extensionId);
  await setup.reload();
  await expect(
    setup.getByText("Aucun raccourci n’est attribué à Pi2 dans ce navigateur."),
  ).toBeVisible();
  await expect(setup.getByRole("button", { name: "Configurer le raccourci" })).toBeVisible();
  expect(
    (await worker.evaluate(() => chrome.commands.getAll())).find(
      (c) => c.name === "toggle-annotations",
    )?.shortcut,
  ).toBe("");
  console.log(
    "Raccourci natif validé : ouverture, sélection requise, activation, pause, reprise et rechargement.",
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
