/**
 * Pure URL→filesystem-path resolution for the `ember://` protocol.
 *
 * Kept free of Electron/fs imports so it can be unit-tested. The caller is
 * responsible for the access-control decision (`isMediaAccessAllowed`) and
 * for actually reading the file.
 */

import { join, resolve, sep } from "path";

export interface EmberResolveContext {
  userData: string;
  home: string;
}

export type EmberScope = "media" | "userdata" | "plugin" | "denied";

export interface EmberResolveResult {
  scope: EmberScope;
  /** Resolved absolute path (present when scope !== "denied"). */
  filePath?: string;
  /** Plugin id when scope === "plugin". */
  pluginId?: string;
  /** HTTP status to return when denied. */
  status?: number;
  message?: string;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** `child` must equal `root` or live strictly beneath it. */
function contained(child: string, root: string): boolean {
  const r = resolve(root);
  const c = resolve(child);
  return c === r || c.startsWith(r + sep);
}

/**
 * Map an ember:// URL to a local file path.
 *
 * Scopes:
 *  - "media"     — host `media` or any unrecognized host; caller MUST run the
 *                  media-access allowlist check before serving.
 *  - "userdata"  — hosts `thumbnails`/`covers`; rooted inside userData.
 *  - "plugin"    — host `plugin`; rooted inside <pluginDir>/assets.
 *  - "denied"    — malformed or escaping request.
 */
export function resolveEmberLocalPath(
  url: { hostname: string; pathname: string },
  ctx: EmberResolveContext,
): EmberResolveResult {
  const host = url.hostname;

  if (host === "plugin") {
    const segments = url.pathname.split("/").filter(Boolean).map((s) => safeDecode(s));
    if (segments.some((s) => s === null)) {
      return { scope: "denied", status: 400, message: "Bad Request" };
    }
    const pluginId = segments[0] as string;
    const assetPath = segments.slice(1).join("/");
    if (!pluginId) {
      return { scope: "denied", status: 400, message: "Bad Request" };
    }
    const pluginDir = join(ctx.home, ".config", "htpc", "plugins", pluginId);
    const assetsRoot = join(pluginDir, "assets");
    const filePath = resolve(assetsRoot, assetPath || ".");
    if (!contained(filePath, assetsRoot)) {
      return { scope: "denied", status: 403, message: "Forbidden" };
    }
    return { scope: "plugin", filePath, pluginId };
  }

  if (host === "thumbnails" || host === "covers") {
    let rel = safeDecode(host + url.pathname);
    if (rel === null) return { scope: "denied", status: 400, message: "Bad Request" };
    if (rel.startsWith("/")) rel = rel.slice(1);
    const filePath = resolve(ctx.userData, rel);
    if (!contained(filePath, ctx.userData)) {
      return { scope: "denied", status: 403, message: "Forbidden" };
    }
    return { scope: "userdata", filePath };
  }

  // host === "media" or any other hostname: decode the pathname as an
  // absolute filesystem path and let the allowlist gate it.
  const decoded = safeDecode(host === "media" ? url.pathname.slice(1) : url.pathname);
  if (decoded === null || !decoded.startsWith("/")) {
    // Must decode to an absolute path — otherwise resolve() would anchor a
    // relative path to the process cwd, which is never intended.
    return { scope: "denied", status: 400, message: "Bad Request" };
  }
  return { scope: "media", filePath: resolve(decoded) };
}
