// STUB: Chromecast receiver mode
// This module scaffolds mDNS advertisement + castv2 receiver initialization.
// Full media session handling is a future implementation.

import { BrowserWindow } from "electron";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let receiverActive = false;

export async function startCastReceiver(window: BrowserWindow): Promise<void> {
  // STUB: Initialize castv2-receiver and advertise via mDNS
  // 1. Advertise device on local network as Chromecast using multicast-dns
  // 2. Accept TLS connection from cast sender
  // 3. Handle LOAD, PLAY, PAUSE, STOP messages
  // 4. Forward media URL to renderer for playback

  log.info("casting", "Cast receiver stub — not yet implemented");
  receiverActive = false;
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("casting:status", {
      active: false,
      message: "Cast receiver not yet implemented",
    });
  }
}

export async function stopCastReceiver(): Promise<void> {
  receiverActive = false;
}

export function isCastReceiverActive(): boolean {
  return receiverActive;
}
