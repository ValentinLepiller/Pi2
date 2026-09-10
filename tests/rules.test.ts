import { expect, test } from "bun:test";
import {
  configurationSchema,
  isNotionUrl,
  notionId,
  originSchema,
  MAX_CONSOLE_BYTES,
} from "../src/lib/models";
import { screenshotCrop } from "../src/lib/screenshot";
import { messageSchema } from "../src/lib/messages";
import { appendConsole, consoleEvent } from "../src/background/sessions";
import { releaseUpdate } from "../src/lib/releases";

test("les mises à jour choisissent le build du navigateur et ne proposent aucun retour en arrière", () => {
  const release = {
    tag_name: "v0.1.10",
    draft: false,
    prerelease: false,
    assets: ["chrome", "firefox", "sources"].map((browser) => ({
      name: `pi2-0.1.10-${browser}.zip`,
      state: "uploaded",
    })),
  };
  for (const browser of ["chrome", "firefox"] as const) {
    expect(releaseUpdate(release, "0.1.9", browser)?.downloadUrl).toBe(
      `https://github.com/ValentinLepiller/Pi2/releases/download/v0.1.10/pi2-0.1.10-${browser}.zip`,
    );
  }
  for (const version of ["0.1.10", "0.1.11", "0.2.0", "1.0.0"]) {
    expect(releaseUpdate(release, version, "chrome")).toBeNull();
  }
  expect(releaseUpdate({ ...release, assets: [] }, "0.1.9", "chrome")).toEqual({
    version: "0.1.10",
    downloadUrl: null,
  });
  expect(
    releaseUpdate(
      { ...release, assets: [{ name: "pi2-0.1.10-chrome.zip", state: "new" }] },
      "0.1.9",
      "chrome",
    )?.downloadUrl,
  ).toBeNull();
  for (const invalid of [
    { ...release, prerelease: true },
    { ...release, tag_name: "../other" },
    {},
  ]) {
    expect(() => releaseUpdate(invalid, "0.1.9", "chrome")).toThrow();
  }
});

test("toutes les pages d’un site partagent leur destination, sans mélanger ports et sous-domaines", () => {
  expect(originSchema.parse("https://staging.monapp.fr/orders?id=1")).toBe(
    "https://staging.monapp.fr",
  );
  expect(originSchema.parse("http://localhost:3000/path")).not.toBe(
    originSchema.parse("http://localhost:4000"),
  );
  expect(originSchema.parse("https://preprod.monapp.fr")).not.toBe(
    originSchema.parse("https://staging.monapp.fr"),
  );
  for (const url of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "example.com",
  ])
    expect(originSchema.safeParse(url).success).toBe(false);
});
test("un lien de vue Notion cible la base, pas l’identifiant de la vue", () => {
  expect(
    notionId(
      "https://www.notion.so/Feedbacks-123456781234123412341234567890ab?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ),
  ).toBe("12345678-1234-1234-1234-1234567890ab");
  expect(() => notionId("https://notion.so.evil.test/123456781234123412341234567890ab")).toThrow();
  expect(() => notionId("https://www.notion.so/not-a-page")).toThrow();
});
test("les pages Notion sont reconnues sur tous leurs domaines, sans accepter les imitations", () => {
  for (const host of ["notion.com", "www.notion.com", "www.notion.so", "team.notion.site"]) {
    const url = `https://${host}/p/team/Feedbacks-123456781234123412341234567890ab?showMoveTo=true&saveParent=true`;
    expect(isNotionUrl(url)).toBe(true);
    expect(notionId(url)).toBe("12345678-1234-1234-1234-1234567890ab");
  }
  for (const url of [
    "https://notion.com.evil.test/page",
    "https://fakenotion.com/page",
    "https://notion.com@evil.test/page",
    "javascript:alert(1)",
    "not-a-url",
  ]) {
    expect(isNotionUrl(url)).toBe(false);
  }
});
test("les exports de configuration ne transportent pas de clé", () => {
  const parsed = configurationSchema.parse({
    version: 1,
    token: "not-exported",
    destinations: [
      {
        id: "d",
        databaseId: "b",
        dataSourceId: "d",
        connectionId: "c",
        name: "Feedbacks",
        url: "https://notion.so/abc",
        token: "not-exported",
      },
    ],
    associations: [],
  });
  expect(JSON.stringify(parsed)).not.toContain("not-exported");
});
test("les feedbacks vides et les messages inconnus sont refusés", () => {
  expect(messageSchema.safeParse({ type: "edit", annotationId: "1", body: "  " }).success).toBe(
    false,
  );
  expect(messageSchema.safeParse({ type: "get-token" }).success).toBe(false);
});
test("les erreurs console sont lisibles avec leurs traces et les arguments indisponibles ont une description", () => {
  const e = consoleEvent("Runtime.consoleAPICalled", {
    type: "error",
    args: [{ value: "checkout failed" }, { description: "Object", type: "object" }],
    stackTrace: {
      callFrames: [
        { functionName: "pay", url: "https://staging.test/app.js", lineNumber: 4, columnNumber: 2 },
      ],
    },
  });
  expect(e?.text).toBe("checkout failed Object");
  expect(e?.stack).toContain("app.js:5:3");
  expect(
    consoleEvent("Runtime.exceptionThrown", {
      exceptionDetails: { exception: { description: "Error: oops" } },
    })?.text,
  ).toContain("oops");
  expect(consoleEvent("Network.requestWillBeSent", {})).toBeUndefined();
});

test("une console très bavarde conserve les événements récents sans bloquer l’envoi Notion", () => {
  let state: Parameters<typeof appendConsole>[0] = { console: [], droppedLogs: 0 };
  for (let i = 0; i < 1200; i++) {
    state = appendConsole(state, {
      level: "error",
      text: `${i}:` + "\u0000".repeat(8000),
      timestamp: new Date().toISOString(),
    });
  }
  expect(state.consoleBytes).toBeLessThanOrEqual(MAX_CONSOLE_BYTES);
  expect(state.console.at(-1)?.text).toStartWith("1199:");
  expect(state.droppedLogs + state.console.length).toBe(1200);
  expect(new Blob([JSON.stringify(state.console, null, 2)]).size).toBeLessThan(
    2 * MAX_CONSOLE_BYTES,
  );
});

test("la capture cadre le composant à l’échelle réelle et coupe uniquement les parties hors fenêtre", () => {
  const viewport = { width: 1000, height: 800, dpr: 2, scrollX: 0, scrollY: 600 };
  expect(
    screenshotCrop(
      { viewport, rect: { x: 100, y: 50, width: 200, height: 80 } },
      { width: 2000, height: 1600 },
    ),
  ).toEqual({ x: 200, y: 100, width: 400, height: 160 });
  expect(
    screenshotCrop(
      { viewport, rect: { x: -10, y: -20, width: 100, height: 80 } },
      { width: 1000, height: 800 },
    ),
  ).toEqual({ x: 0, y: 0, width: 90, height: 60 });
  expect(
    screenshotCrop(
      { viewport, rect: { x: 950.5, y: 780.5, width: 100, height: 80 } },
      { width: 1000, height: 800 },
    ),
  ).toEqual({ x: 950, y: 780, width: 50, height: 20 });
  // A viewport capture can be shorter than the page viewport; pixels still have a uniform scale.
  expect(
    screenshotCrop(
      { viewport, rect: { x: 100, y: 50, width: 200, height: 80 } },
      { width: 1000, height: 600 },
    ),
  ).toEqual({ x: 100, y: 50, width: 200, height: 80 });
  expect(() =>
    screenshotCrop(
      { viewport, rect: { x: 1100, y: 50, width: 100, height: 80 } },
      { width: 1000, height: 800 },
    ),
  ).toThrow("hors de la fenêtre");
});
