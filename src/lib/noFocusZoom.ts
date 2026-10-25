/**
 * Stops iOS zooming the page when a field is focused. Safari respects
 * `maximum-scale=1` in the viewport meta for that focus zoom while still
 * allowing pinch zoom (since iOS 10), so the setting costs nothing there. Other
 * browsers would lose pinch zoom from it, so it is only applied on iOS. The
 * hosted page's viewport meta is written by its wrapper, so it is patched at run
 * time rather than in index.html.
 */

/** iPhones and iPods, and iPads, which report themselves as a Mac with a touch screen. */
export function isIOS(nav: Pick<Navigator, "userAgent" | "maxTouchPoints">): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** The viewport content with `maximum-scale=1` added once. */
export function withMaxScale(content: string): string {
  return /maximum-scale/.test(content) ? content : `${content.trim()}, maximum-scale=1`;
}

export function stopFocusZoomOnIOS(): boolean {
  if (!isIOS(navigator)) return false;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    document.head.appendChild(meta);
  }
  meta.content = withMaxScale(meta.content);
  return true;
}
