import { browser } from "wxt/browser";
import { ANNOTATOR_STATUS, CLOSE_ANNOTATOR } from "../lib/annotation-control";
import { getConfiguration, getConnections } from "../lib/configuration";
import { isNotionUrl, originSchema } from "../lib/models";
import { activeId, pause, start } from "./sessions";

export async function toggleAnnotations(commandTab?: chrome.tabs.Tab) {
  const tab =
    commandTab?.id !== undefined
      ? commandTab
      : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab?.id === undefined) return;
  const tabId = tab.id;
  await browser.storage.session.remove("shortcutError");
  let showPopup = false;
  try {
    showPopup = await navigator.locks.request("start-session", async () => {
      if (await activeId(tabId)) {
        // A reload keeps the draft but removes the overlay: the next shortcut should resume it.
        const visible = await browser.tabs
          .sendMessage(tabId, { type: ANNOTATOR_STATUS }, { frameId: 0 })
          .then((reply) => reply?.visible === true)
          .catch(() => false);
        if (visible) {
          await navigator.locks.request(`capture:${tabId}`, () => pause(tabId));
          await browser.tabs
            .sendMessage(tabId, { type: CLOSE_ANNOTATOR }, { frameId: 0 })
            .catch(() => {});
          return false;
        }
      }
      const origin = originSchema.safeParse(tab.url);
      if (!origin.success || isNotionUrl(tab.url ?? "")) return true;
      const config = await getConfiguration();
      const association = config.associations.find((a) => a.origin === origin.data);
      const destination = config.destinations.find((d) => d.id === association?.destinationId);
      if (!destination || !(await getConnections()).some((c) => c.id === destination.connectionId))
        return true;
      await start(tabId);
      return false;
    });
  } catch (error) {
    await browser.storage.session.set({
      shortcutError: {
        tabId,
        message: error instanceof Error ? error.message : "Impossible d’activer les annotations.",
      },
    });
    showPopup = true;
  }
  if (showPopup) {
    // The user may have switched windows while the command was being handled.
    await browser.action.openPopup({ windowId: tab.windowId }).catch(() => {});
  }
}
