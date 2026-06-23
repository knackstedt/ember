export function scaleImageUrl(
  url: string | undefined,
  width: number,
  height: number,
): string | undefined {
  if (!url) return url;
  if (!url.startsWith("ember://")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}w=${width}&h=${height}`;
}

export function scaledImageUrl(
  url: string | undefined,
  cssWidth: number,
  cssHeight: number,
): string | undefined {
  const dpr = window.devicePixelRatio || 1;
  return scaleImageUrl(url, Math.round(cssWidth * dpr), Math.round(cssHeight * dpr));
}
