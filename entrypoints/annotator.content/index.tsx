import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { createRoot } from "react-dom/client";
import { ANNOTATOR_HOST } from "../../src/annotator/dom";
import { ANNOTATOR_STATUS, CLOSE_ANNOTATOR } from "../../src/lib/annotation-control";
import { Overlay } from "../../src/annotator/Overlay";
import { loadAnnotationFonts } from "../../src/annotator/fonts";
import "../../src/lib/i18n";
import "../../src/annotator/style.css";
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  registration: "runtime",
  cssInjectionMode: "ui",
  async main(ctx) {
    if (document.querySelector(ANNOTATOR_HOST)) return;
    loadAnnotationFonts();
    const ui = await createShadowRootUi(ctx, {
      name: ANNOTATOR_HOST,
      position: "overlay",
      zIndex: 2147483647,
      isolateEvents: ["keydown", "keyup", "keypress"],
      onMount(container, shadow, host) {
        const root = createRoot(container);
        root.render(<Overlay host={host} close={() => ui.remove()} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
        browser.runtime.onMessage.removeListener(control);
      },
    });
    const control = (
      message: { type?: string },
      sender: chrome.runtime.MessageSender,
      respond: (response: unknown) => void,
    ) => {
      if (sender.id !== browser.runtime.id) return;
      if (message.type === ANNOTATOR_STATUS) respond({ visible: true });
      if (message.type === CLOSE_ANNOTATOR) {
        ui.remove();
        respond({ closed: true });
      }
    };
    browser.runtime.onMessage.addListener(control);
    ui.mount();
  },
});
