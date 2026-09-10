import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const freePort = async () => {
  const server = createTcpServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
};
const driverPort = await freePort();
const driver = spawn(
  process.env.GECKODRIVER ?? "geckodriver",
  ["--port", String(driverPort), "--allow-system-access"],
  { stdio: "ignore" },
);
let driverError;
driver.on("error", (e) => (driverError = e));
const endpoint = `http://127.0.0.1:${driverPort}`;
let s;
let server;
try {
  for (let i = 0; i < 100; i++) {
    if (driverError) throw driverError;
    try {
      if ((await fetch(endpoint + "/status")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const created = await (
    await fetch(endpoint + "/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: "firefox",
            "moz:firefoxOptions": {
              args: ["-headless"],
              ...(process.env.FIREFOX_BINARY ? { binary: process.env.FIREFOX_BINARY } : {}),
            },
          },
        },
      }),
    })
  ).json();
  s = created.value;
  if (!s.sessionId) {
    driver.kill();
    throw Error(JSON.stringify(s));
  }
  async function call(path, body) {
    const d = await (
      await fetch(`${endpoint}/session/${s.sessionId}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    ).json();
    if (d.value?.error) throw Error(JSON.stringify(d.value));
    return d.value;
  }
  const exec = (script, args = []) => call("/execute/sync", { script, args });
  const asyncExec = (script, args = []) =>
    call("/execute/async", {
      script: `const done=arguments[arguments.length-1]; (async()=>{${script}})().then(done, e=>done({testError:String(e)}));`,
      args,
    });
  const msg = async (data) => {
    const r = await asyncExec("return await browser.runtime.sendMessage(arguments[0]);", [data]);
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.data;
  };
  const pageId = "11111111-1111-1111-1111-111111111111",
    dbId = "22222222-2222-2222-2222-222222222222",
    sourceId = "33333333-3333-3333-3333-333333333333";
  const pages = [],
    blocks = {},
    uploads = {};
  server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const path = new URL(req.url, "http://fixture").pathname.replace("/v1", "");
      const body =
        raw.length && req.headers["content-type"]?.includes("application/json")
          ? JSON.parse(raw)
          : {};
      let data = {};
      if (!req.url.startsWith("/v1")) {
        res.setHeader("content-type", "text/html");
        res.end(
          '<html><title>Pi2 Firefox test</title><body style="margin:0"><div id="target" style="position:absolute;left:100px;top:100px;width:300px;height:120px;background:rgb(112,64,176)"></div></body></html>',
        );
        return;
      }
      if (path === "/users/me")
        data = { object: "user", id: "fixture-bot", bot: { workspace_name: "Firefox test" } };
      else if (path === `/databases/${pageId}`) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ object: "error", code: "object_not_found" }));
        return;
      } else if (path === "/databases" || path === `/databases/${dbId}`)
        data = {
          object: "database",
          id: dbId,
          url: `https://www.notion.so/${dbId}`,
          title: [{ plain_text: "Firefox" }],
          data_sources: [{ id: sourceId, name: "Feedbacks" }],
          parent: { type: "page_id", page_id: pageId },
        };
      else if (path === `/data_sources/${sourceId}`)
        data = {
          id: sourceId,
          properties: Object.fromEntries(
            Object.entries({
              Nom: "title",
              Statut: "select",
              Site: "url",
              Environnement: "rich_text",
              Date: "date",
              Envoi: "rich_text",
            }).map(([name, type]) => [name, { id: name, type }]),
          ),
        };
      else if (path === `/pages/${pageId}`)
        data = {
          id: pageId,
          url: `https://www.notion.so/${pageId}`,
          properties: { title: { type: "title", title: [{ plain_text: "Firefox" }] } },
        };
      else if (path.endsWith("/query")) data = { results: [], has_more: false };
      else if (path === "/pages") {
        data = {
          id: `44444444-4444-4444-4444-${String(pages.length).padStart(12, "0")}`,
          url: "https://www.notion.so/test",
          properties: body.properties,
        };
        pages.push(data);
      } else if (path === "/file_uploads") {
        const id = `upload-${Object.keys(uploads).length}`;
        uploads[id] = { filename: body.filename, status: "pending" };
        data = { id, status: "pending" };
      } else if (path.startsWith("/file_uploads/")) {
        const id = path.split("/")[2];
        if (req.method === "POST") Object.assign(uploads[id], { status: "uploaded", body: raw });
        data = { id, status: uploads[id].status };
      } else if (path.startsWith("/blocks/")) {
        const id = path.split("/")[2];
        if (req.method === "PATCH") blocks[id] = body.children;
        data = { results: blocks[id] ?? [], has_more: false };
      } else throw Error("Unexpected API request " + path);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(data));
    } catch (e) {
      console.error(e);
      res.writeHead(500);
      res.end("{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const addon = await call("/moz/addon/install", {
    path: process.cwd() + "/.output/firefox-mv3",
    temporary: true,
  });
  await call("/moz/context", { context: "chrome" });
  // Redirect only the external Notion API in this isolated test profile; app code stays intact.
  const extensionId = await exec(
    'return JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[arguments[0]];',
    [addon],
  );
  await exec(
    `const origin=arguments[0]; const win=Services.wm.getMostRecentWindow('navigator:browser');win.pi2AuthChecks=[];Services.obs.addObserver({observe(subject){const channel=subject.QueryInterface(Ci.nsIHttpChannel);if(channel.URI.host==='api.notion.com'){win.pi2AuthChecks.push(channel.getRequestHeader('Authorization')==='Bearer ntn_fixture_only_not_a_real_token');channel.redirectTo(Services.io.newURI(origin+channel.URI.pathQueryRef));}}},'http-on-modify-request');`,
    [origin],
  );
  await call("/moz/context", { context: "content" });
  await call("/url", { url: `moz-extension://${extensionId}/popup.html` });
  const connected = await msg({ type: "connect", token: "ntn_fixture_only_not_a_real_token" });
  const prepared = await msg({ type: "prepare", connectionId: connected.id, pageId });
  await msg({
    type: "associate",
    association: { origin, destinationId: prepared[0].id, environment: "Test" },
  });
  const popupHandle = await call("/window");
  const tab = await asyncExec("return await browser.tabs.create({url:arguments[0]});", [origin]);
  const handles = await call("/window/handles");
  const siteHandle = handles.find((h) => h !== popupHandle);
  await call("/window", { handle: siteHandle });
  const shortcut = async () => {
    await call("/moz/context", { context: "chrome" });
    await call("/actions", {
      actions: [
        {
          type: "key",
          id: "keyboard",
          actions: [
            { type: "keyDown", value: "\uE009" },
            { type: "keyDown", value: "." },
            { type: "keyUp", value: "." },
            { type: "keyUp", value: "\uE009" },
          ],
        },
      ],
    });
    await call("/moz/context", { context: "content" });
  };
  await shortcut();
  const until = async (fn) => {
    for (let i = 0; i < 100; i++) {
      const v = await fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error(
      "Timed out: " +
        (await exec(
          'return document.querySelector("pi2-annotator")?.shadowRoot?.querySelector(".vf-error")?.textContent;',
        )),
    );
  };
  await until(() =>
    exec('return !!document.querySelector("pi2-annotator")?.shadowRoot?.querySelector("button");'),
  );
  await exec('document.querySelector("#target").click();');
  await until(() =>
    exec(
      'return !!document.querySelector("pi2-annotator")?.shadowRoot?.querySelector("textarea");',
    ),
  );
  const textarea = await exec(
    'return document.querySelector("pi2-annotator").shadowRoot.querySelector("textarea");',
  );
  const eid = textarea["element-6066-11e4-a52e-4f735466cecf"];
  await call(`/element/${eid}/value`, { text: "Firefox capture test" });
  await exec(
    'Array.from(document.querySelector("pi2-annotator").shadowRoot.querySelectorAll("button")).find(b=>b.textContent.includes("Ajouter")).click();',
  );
  await until(() =>
    exec(
      'return Array.from(document.querySelector("pi2-annotator").shadowRoot.querySelectorAll("button")).some(b=>b.getAttribute("aria-label")==="Modifier l’annotation 1");',
    ),
  );
  await shortcut();
  await until(() => exec('return !document.querySelector("pi2-annotator");'));
  await shortcut();
  await until(() =>
    exec(
      'return Array.from(document.querySelector("pi2-annotator")?.shadowRoot?.querySelectorAll("button") ?? []).some(b=>b.getAttribute("aria-label")==="Modifier l’annotation 1");',
    ),
  );
  await call("/window", { handle: popupHandle });
  const state = await msg({ type: "state" });
  const exported = await msg({ type: "export-session", id: state.sessions[0].id });
  assert.equal(exported.consoleStatus, "unavailable");
  assert.equal(exported.annotations.length, 1);
  assert.equal(exported.console.length, 0);
  assert.ok(!JSON.stringify(exported).includes("ntn_fixture_only_not_a_real_token"));
  const pixels = await asyncExec(
    'const bitmap=await createImageBitmap(await(await fetch(arguments[0])).blob());const c=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=c.getContext("2d");ctx.drawImage(bitmap,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let altered=0;for(let i=0;i<d.length;i+=4)if(d[i]!==112||d[i+1]!==64||d[i+2]!==176||d[i+3]!==255)altered++;return {width:c.width,height:c.height,altered};',
    [exported.screenshots[0].dataUrl],
  );
  assert.deepEqual(pixels, { width: 300, height: 120, altered: 0 });
  const security = await asyncExec(
    'return (await browser.scripting.executeScript({target:{tabId:arguments[0]},func:async()=>({local:await browser.storage.local.get("connections"),reply:await browser.runtime.sendMessage({type:"state"})})}))[0].result;',
    [tab.id],
  );
  assert.deepEqual(security.local, {});
  assert.equal(security.reply.ok, false);
  await call("/window", { handle: siteHandle });
  await exec(
    'Array.from(document.querySelector("pi2-annotator").shadowRoot.querySelectorAll("button")).find(b=>b.textContent.includes("Envoyer")).click();',
  );
  await call("/window", { handle: popupHandle });
  await until(async () => (await msg({ type: "state" })).sessions[0].status === "sent");
  assert.equal(pages.length, 1);
  assert.equal(Object.keys(uploads).length, 2);
  assert.equal(blocks[pages[0].id].filter((b) => b.type === "image").length, 1);
  await call("/refresh", {});
  assert.equal((await msg({ type: "state" })).connections.length, 1);
  await msg({ type: "disconnect", id: connected.id });
  assert.equal((await msg({ type: "state" })).connections.length, 0);
  await call("/moz/context", { context: "chrome" });
  const authChecks = await exec(
    "return Services.wm.getMostRecentWindow('navigator:browser').pi2AuthChecks;",
  );
  assert.ok(authChecks.length > 10 && authChecks.every(Boolean));
  console.log("PASS Firefox connection, annotation, crop, security, Notion export, disconnect");
} finally {
  server?.close();
  if (s?.sessionId)
    await fetch(endpoint + "/session/" + s.sessionId, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  driver.kill();
}
