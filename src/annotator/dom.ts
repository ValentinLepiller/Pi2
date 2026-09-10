import type { Target } from "../lib/models";
export const ANNOTATOR_HOST = "pi2-annotator";
export function syncViewportZoom(host: HTMLElement) {
  // Bounding rectangles already include ancestor zoom; the overlay must use viewport pixels.
  let zoom = 1;
  for (let parent = host.parentElement; parent; parent = parent.parentElement) {
    const value = Number.parseFloat(getComputedStyle(parent).zoom);
    if (Number.isFinite(value) && value > 0) zoom *= value;
  }
  const inverse = String(1 / zoom);
  if (host.style.getPropertyValue("--pi2-viewport-zoom") !== inverse)
    host.style.setProperty("--pi2-viewport-zoom", inverse);
}
export function ownElement(event: Event) {
  return event
    .composedPath()
    .some((e) => e instanceof Element && e.tagName.toLowerCase() === ANNOTATOR_HOST);
}
function localSelector(element: Element, root: Document | ShadowRoot): string {
  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (root.querySelectorAll(selector).length === 1) return selector;
  }
  for (const attr of ["data-testid", "data-test", "data-cy"]) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `[${attr}="${CSS.escape(value)}"]`;
      if (root.querySelectorAll(selector).length === 1) return selector;
    }
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((e) => e.tagName === current!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    if (root.querySelectorAll(selector).length === 1) return selector;
    current = parent;
  }
  return parts.join(" > ");
}
export function selectorFor(element: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  const local = localSelector(element, root);
  return root instanceof ShadowRoot ? `${selectorFor(root.host)} >>> ${local}` : local;
}
export function locate(selector: string): Element | null {
  try {
    let root: Document | ShadowRoot = document;
    const parts = selector.split(" >>> ");
    let element: Element | null = null;
    for (const [index, part] of parts.entries()) {
      element = root.querySelector(part);
      if (!element) return null;
      if (index < parts.length - 1) {
        if (!element.shadowRoot) return null;
        root = element.shadowRoot;
      }
    }
    return element;
  } catch {
    return null;
  }
}
export function selectable(event: MouseEvent | PointerEvent): Element | null {
  if (ownElement(event)) return null;
  const first = event.composedPath().find((e) => e instanceof Element) as Element | undefined;
  if (!first || ["HTML", "BODY", "IFRAME"].includes(first.tagName)) return null;
  return first;
}
export function describe(element: Element): Target {
  const r = element.getBoundingClientRect();
  if (!element.isConnected || r.width <= 0 || r.height <= 0)
    throw Error("Cet élément n’est plus visible. Sélectionnez-le à nouveau.");
  return {
    selector: selectorFor(element).slice(0, 4000),
    path: elementPath(element).slice(0, 4000),
    tag: element.tagName.toLowerCase(),
    text: (element.textContent ?? "").trim().slice(0, 4000),
    nearbyText: (element.parentElement?.textContent ?? "").trim().slice(0, 4000),
    role: (element.getAttribute("role") ?? "").slice(0, 200),
    name: (element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "").slice(
      0,
      1000,
    ),
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scrollX, scrollY },
    url: location.href,
    title: document.title.slice(0, 1000),
  };
}
function elementPath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    parts.unshift(current.tagName.toLowerCase() + (current.id ? `#${current.id}` : ""));
    current =
      current.parentElement ??
      (current.getRootNode() instanceof ShadowRoot
        ? (current.getRootNode() as ShadowRoot).host
        : null);
  }
  return parts.join(" > ");
}
