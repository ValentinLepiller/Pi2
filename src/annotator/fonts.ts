import { browser } from "wxt/browser";
// Chromium resolves fonts used inside a Shadow DOM from the document's font set.
export function loadAnnotationFonts() {
  for (const [family, filename, weight] of [
    ["VF Jost", "jost-latin.woff2", "100 900"],
    ["VF Fira Mono", "fira-mono-latin.woff2", "500"],
  ] as const) {
    if ([...document.fonts].some((font) => font.family === family)) continue;
    const font = new FontFace(family, `url("${browser.runtime.getURL(`/fonts/${filename}`)}")`, {
      weight,
    });
    document.fonts.add(font);
    void font.load().catch(() => {
      /* Keep the system font if the page blocks font loading. */
    });
  }
}
