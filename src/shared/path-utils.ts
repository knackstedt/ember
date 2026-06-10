/**
 * Detect whether a file path originates from a remote source.
 * Remote sources are served via rclone HTTP or referenced via ember://remote/ URLs.
 */
export function isRemotePath(path: string | undefined): boolean {
  if (!path) return false;
  return (
    path.startsWith("ember://remote/") ||
    /^http:\/\/localhost:\d+\//.test(path)
  );
}

/**
 * Resolve a source location string for a given path.
 */
export function resolveSourceLocation(path: string | undefined): "local" | "remote" {
  return isRemotePath(path) ? "remote" : "local";
}

/**
 * Resolve a filePath into a browser-playable ember:// URL.
 * Local filesystem paths become ember://media/<path>.
 * Remote ember://remote/ URLs are passed through unchanged.
 */
export function resolveMediaUrl(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  if (filePath.startsWith("ember://")) return filePath;
  return `ember://media/${filePath}`;
}
