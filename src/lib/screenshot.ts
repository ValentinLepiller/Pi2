import type { Target } from "./models";

export function screenshotCrop(
  target: Pick<Target, "rect" | "viewport">,
  image: { width: number; height: number },
) {
  const { rect, viewport } = target;
  // Use the actual bitmap scale: zoom and high-density screens need not match CSS pixels.
  const scale = image.width / viewport.width;
  const left = Math.max(0, Math.floor(rect.x * scale));
  const top = Math.max(0, Math.floor(rect.y * scale));
  const right = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale));
  const bottom = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale));
  if (right <= left || bottom <= top)
    throw Error("Cet élément est hors de la fenêtre. Rendez-le visible puis réessayez.");
  return { x: left, y: top, width: right - left, height: bottom - top };
}
