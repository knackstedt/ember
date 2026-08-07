import { app, ipcMain } from "electron";
import { existsSync } from "fs";
import { join, resolve } from "path";
import type { AudioTags, MusicTrack } from "../../../shared/types";
import { getDb } from "../../db";
import { MusicRepo } from "../../db/repository";
import { scanMusicFiles } from "../../scanners/music.scanner";
import { getXdgMusicDir } from "../../scanners/xdg";
import { launchTrack } from "../../services/launcher.service";
import {
    downloadImage,
    embedCoverArt,
    fetchArtistThumbnail,
    loadThumbnail,
    pickCoverImage,
    regenerateThumbnail as regenerateMusicThumbnail,
    searchCoverArt,
} from "../../services/music-cover.service";
import { enrichTrack, enrichTracks } from "../../services/music-enrichment.service";
import { executeReorganize, previewReorganize } from "../../services/music-reorganize.service";
import { writeTags } from "../../services/music-tag-writer.service";
import { scanAllRemoteSources } from "../../services/remote-scan.service";
import { applyCorruptPolicy, getSettings } from "../../services/settings.service";
import { uninstallMusic } from "../../services/uninstall.service";
import { createLogger } from "../../util/logger";
import type { IpcContext } from "../types";

const log = createLogger("info");

export function registerMusicHandlers(ctx: IpcContext): void {
  const { window, sendToWindow, sendRemoteProgress, sendScanItem, scanLocks } = ctx;

  ipcMain.handle("music:scan", async (_e, extraPaths?: string[]) => {
    if (scanLocks.music) return;
    scanLocks.music = true;
    sendToWindow("scan:progress", { scanner: "music", current: 0, total: 0, status: "scanning" });
    const tracks = await scanMusicFiles(extraPaths).finally(() => { scanLocks.music = false; });
    log.debug("music:scan", `inserting ${tracks.length} tracks into DB...`);
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (i % 100 === 0) log.debug("music:scan", `db insert ${i + 1}/${tracks.length}`);
      try {
        await MusicRepo.upsert({ ...track, missing: false });
        if (track.corrupt) await applyCorruptPolicy(track.id, "music");
      } catch (err) {
        log.warn("music:scan", `Failed to upsert track ${track.id}: ${err}`);
      }
    }
    log.debug("music:scan", "DB insert done");

    const allScannedPaths = [getXdgMusicDir(), ...(extraPaths ?? [])].filter(existsSync);
    await markMissingMusic(allScannedPaths, tracks);

    sendToWindow("scan:progress", { scanner: "music", current: tracks.length, total: tracks.length, status: "done" });
    void scanAllRemoteSources("music", sendRemoteProgress, sendScanItem);
    sendToWindow("scan:background:complete", { type: "music" });
  });

  ipcMain.handle("music:list", async () => {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>("SELECT * FROM music_track ORDER BY artist, album, trackNumber ASC");
    const tracks = (result[0] ?? []) as MusicTrack[];
    const coverRoot = join(app.getPath("userData"), "covers", "music").replace(/\\/g, "/");
    return tracks.map((t) => {
      const id = typeof t.id === "string" ? t.id : ((t.id as any)?.id ?? String(t.id));
      const normalized = { ...t, id };
      if (!normalized.albumArtUrl?.startsWith("file://")) return normalized;
      const pathPart = normalized.albumArtUrl.slice("file://".length);
      if (!pathPart.startsWith(coverRoot)) return normalized;
      const rel = pathPart.slice(coverRoot.length + 1).replace(/\\/g, "/");
      return { ...normalized, albumArtUrl: `ember://covers/music/${rel}` };
    });
  });

  ipcMain.handle("music:launch", (_e, track: MusicTrack) => launchTrack(track));
  ipcMain.handle("music:favorite", async (_e, id: string, value: boolean) => MusicRepo.setFavorite(id, value));
  ipcMain.handle("music:tag", async (_e, id: string, tags: string[]) => MusicRepo.setTags(id, tags));
  ipcMain.handle("music:writeTags", async (_e, filePath: string, tags: AudioTags) => writeTags(filePath, tags));
  ipcMain.handle("music:hide", async (_e, id: string, value: boolean) => MusicRepo.setHidden(id, value));
  ipcMain.handle("music:delete", async (_e, id: string) => MusicRepo.delete(id));
  ipcMain.handle("music:uninstall", async (_e, track: MusicTrack) => uninstallMusic(track));

  ipcMain.handle("music:searchCoverArt", async (_e, track: MusicTrack) => {
    const imageUrl = await searchCoverArt(track.artist ?? "", track.album ?? "");
    if (!imageUrl) return null;
    const imageBuffer = await downloadImage(imageUrl);
    if (!imageBuffer) return null;
    const result = await embedCoverArt(track, imageBuffer);
    return result ?? null;
  });

  ipcMain.handle("music:pickCoverImage", async (_e, track: MusicTrack) => {
    const result = await pickCoverImage(track);
    return result ?? null;
  });

  ipcMain.handle("music:loadThumbnail", async (_e, track: MusicTrack) => {
    const url = await loadThumbnail(track);
    return url ?? null;
  });

  ipcMain.handle("music:regenerateThumbnail", async (_e, track: MusicTrack) => {
    const url = await regenerateMusicThumbnail(track);
    return url ?? null;
  });

  ipcMain.handle("music:artistThumbnail", async (_e, artist: string) => {
    const url = await fetchArtistThumbnail(artist);
    return url ?? null;
  });

  ipcMain.handle("music:enrich", async (_e, track: MusicTrack) => {
    const settings = await getSettings();
    const result = await enrichTrack(track, { tadbApiKey: settings.theaudiodbApiKey });
    if (Object.keys(result.updates).length > 0) {
      const db = getDb();
      const id = typeof track.id === "string" ? track.id : (track.id as any)?.id ?? String(track.id);
      const setClauses = Object.entries(result.updates).map(([key]) => `${key} = $updates.${key}`).join(", ");
      await db.query(`UPDATE music_track:⟨${id}⟩ SET ${setClauses}`, { updates: result.updates });
    }
    return result;
  });

  ipcMain.handle("music:enrichBatch", async (_e, tracks: MusicTrack[]) => {
    const settings = await getSettings();
    const results = await enrichTracks(tracks, {
      tadbApiKey: settings.theaudiodbApiKey,
      onProgress: (current, total) => {
        sendToWindow("scan:progress", {
          scanner: "music-enrich", current, total,
          status: current === total ? "done" : "scanning",
        });
      },
    });

    const db = getDb();
    for (const [trackId, result] of results) {
      if (Object.keys(result.updates).length > 0) {
        try {
          const setClauses = Object.entries(result.updates).map(([key]) => `${key} = $updates.${key}`).join(", ");
          await db.query(`UPDATE music_track:⟨${trackId}⟩ SET ${setClauses}`, { updates: result.updates });
        } catch (err) {
          log.error("music:enrichBatch", `DB update failed for ${trackId}: ${err}`);
        }
      }
    }

    const serialized: Record<string, { updates: Partial<MusicTrack>; coverArtUrl?: string; artistImageUrl?: string }> = {};
    for (const [id, result] of results) serialized[id] = result;
    return serialized;
  });

  ipcMain.handle("music:lastPlayed", async (_e, id: string, timestamp: number) => MusicRepo.setLastPlayed(id, timestamp));

  ipcMain.handle("music:reorganizePreview", async (_e, pattern: string) => {
    const settings = await getSettings();
    const musicPaths = [getXdgMusicDir(), ...(settings.musicPaths ?? [])].filter(existsSync);
    return previewReorganize(pattern, musicPaths);
  });

  ipcMain.handle("music:reorganize", async (_e, pattern: string) => {
    const settings = await getSettings();
    const musicPaths = [getXdgMusicDir(), ...(settings.musicPaths ?? [])].filter(existsSync);
    const result = await executeReorganize(pattern, musicPaths);
    if (result.moves.length > 0) {
      sendToWindow("music:filesMoved", { moves: result.moves });
    }
    return result;
  });

  async function markMissingMusic(scannedPaths: string[], foundTracks: { id: string; filePath?: string }[]): Promise<void> {
    const foundIds = new Set(foundTracks.map((t) => t.id));
    const allTracks = await MusicRepo.list();
    const resolvedPaths = scannedPaths.map((p) => resolve(p));
    for (const track of allTracks) {
      if (track.sourceLocation !== "local") continue;
      if (!track.filePath) continue;
      const isFromScannedPath = resolvedPaths.some((p) => track.filePath!.startsWith(p));
      if (!isFromScannedPath) continue;
      if (!foundIds.has(track.id) && !track.missing) {
        await MusicRepo.setMissing(track.id, true);
        log.info("music:scan", `marked missing: ${track.title}`);
      } else if (foundIds.has(track.id) && track.missing) {
        await MusicRepo.setMissing(track.id, false);
        log.info("music:scan", `restored: ${track.title}`);
      }
    }
  }
}
