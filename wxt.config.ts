import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Pi2",
    description: "Pointez. Commentez. Retrouvez tout dans Notion.",
    permissions: ["activeTab", "scripting", "storage", "alarms", "debugger"],
    host_permissions: ["https://api.notion.com/*"],
    web_accessible_resources: [
      { resources: ["fonts/*.woff2"], matches: ["http://*/*", "https://*/*"] },
    ],
    icons: { 16: "icon-16.png", 48: "icon-48.png", 128: "icon-128.png" },
    commands: {
      "toggle-annotations": {
        suggested_key: { default: "Ctrl+Period", mac: "MacCtrl+Period" },
        description: "Activer ou mettre en pause les annotations, ou ouvrir Pi2",
      },
    },
    minimum_chrome_version: "127",
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
