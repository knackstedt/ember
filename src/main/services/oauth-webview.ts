import { BrowserWindow } from "electron";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export interface OAuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  error?: string;
}

export async function startOAuthFlow(
  authUrl: string,
  redirectUrlPatterns: string[],
): Promise<OAuthResult> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      show: false,
      title: "Authenticate",
    });

    let resolved = false;

    function finish(result: OAuthResult): void {
      if (resolved) return;
      resolved = true;
      try { win.close(); } catch {}
      resolve(result);
    }

    win.webContents.on("will-redirect", (_event, url) => {
      checkRedirect(url, redirectUrlPatterns, finish);
    });

    win.webContents.on("will-navigate", (_event, url) => {
      checkRedirect(url, redirectUrlPatterns, finish);
    });

    win.webContents.on("did-finish-load", () => {
      const currentUrl = win.webContents.getURL();
      checkRedirect(currentUrl, redirectUrlPatterns, finish);
    });

    win.on("closed", () => {
      finish({ success: false, error: "Window closed by user" });
    });

    win.loadURL(authUrl);
    win.show();
  });
}

function checkRedirect(
  url: string,
  patterns: string[],
  finish: (result: OAuthResult) => void,
): void {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern);
    if (regex.test(url)) {
      try {
        const parsed = new URL(url);
        const code = parsed.searchParams.get("code");
        const token = parsed.searchParams.get("token") || parsed.searchParams.get("access_token");
        const refreshToken = parsed.searchParams.get("refresh_token");

        if (token) {
          finish({ success: true, token, refreshToken: refreshToken || undefined });
          return;
        }
        if (code) {
          // Exchange code for token via rclone config create
          finish({ success: true, token: code });
          return;
        }
        const error = parsed.searchParams.get("error");
        if (error) {
          finish({ success: false, error: `OAuth error: ${error}` });
          return;
        }
      } catch {
        // invalid URL
      }
    }
  }
}
