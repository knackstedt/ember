import { Movie, MusicTrack, Game, RemoteSource } from "../../shared/types";
import { MovieRepo, MusicRepo, GameRepo, RemoteSourceRepo } from "../db/repository";
import { remoteFileExists } from "./rclone-manager";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let availabilityInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

function parseEmberPath(emberPath: string): { sourceId: string; remotePath: string } | null {
  if (!emberPath.startsWith("ember://remote/")) return null;
  const url = new URL(emberPath);
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) return null;
  const sourceId = segments[0];
  const remotePath = "/" + segments.slice(1).join("/");
  return { sourceId, remotePath };
}

async function checkBatch<T extends { id: string; filePath?: string; romPath?: string; missing?: boolean }>(
  items: T[],
  sources: RemoteSource[],
  setMissing: (id: string, value: boolean) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        const path = item.filePath ?? (item as any).romPath;
        if (!path) return;
        const parsed = parseEmberPath(path);
        if (!parsed) return;

        const source = sources.find((s) => s.id === parsed.sourceId);
        if (!source) {
          // Source was removed; mark missing only if not already marked
          if (!item.missing) {
            log.warn("remote:availability", `source ${parsed.sourceId} not found for ${item.id}`);
            await setMissing(item.id, true);
          }
          return;
        }

        if (!source.enabled) {
          // Skip checking disabled sources so they don't cause mass-missing marks
          return;
        }

        try {
          const exists = await remoteFileExists(source, parsed.remotePath);
          const nextMissing = !exists;
          if (nextMissing === item.missing) {
            // No state change; skip DB write and logging
            return;
          }
          await setMissing(item.id, nextMissing);
          if (nextMissing) {
            log.info("remote:availability", `marked missing: ${path}`);
          } else {
            log.info("remote:availability", `restored: ${path}`);
          }
        } catch (err) {
          log.warn("remote:availability", `check failed for ${path}: ${err}`);
        }
      }),
    );
    if (i + BATCH_SIZE < items.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}

export async function checkRemoteAvailability(): Promise<void> {
  if (isRunning) {
    log.debug("remote:availability", "already running, skipping");
    return;
  }
  isRunning = true;
  log.info("remote:availability", "starting check");

  try {
    const sources = await RemoteSourceRepo.list();
    const enabledSources = sources.filter((s) => s.enabled);
    if (enabledSources.length === 0) {
      log.debug("remote:availability", "no enabled remote sources, skipping file checks");
    }

    const [movies, tracks, games] = await Promise.all([
      MovieRepo.list(),
      MusicRepo.list(),
      GameRepo.list(),
    ]);

    const remoteMovies = movies.filter(
      (m) => m.filePath?.startsWith("ember://remote/"),
    );
    const remoteTracks = tracks.filter(
      (t) => t.filePath?.startsWith("ember://remote/"),
    );
    const remoteGames = games.filter(
      (g) => g.romPath?.startsWith("ember://remote/"),
    );

    log.info(
      "remote:availability",
      `checking ${remoteMovies.length} movies, ${remoteTracks.length} tracks, ${remoteGames.length} games`,
    );

    await checkBatch(remoteMovies, enabledSources, MovieRepo.setMissing);
    await checkBatch(remoteTracks, enabledSources, MusicRepo.setMissing);
    await checkBatch(remoteGames, enabledSources, GameRepo.setMissing);

    log.info("remote:availability", "check complete");
  } catch (err) {
    log.error("remote:availability", `check failed: ${err}`);
  } finally {
    isRunning = false;
  }
}

export function startRemoteAvailabilityWorker(): void {
  if (availabilityInterval) return;
  log.info("remote:availability", `starting worker (interval ${CHECK_INTERVAL_MS}ms)`);
  // Run immediately on start, then on interval
  void checkRemoteAvailability();
  availabilityInterval = setInterval(() => {
    void checkRemoteAvailability();
  }, CHECK_INTERVAL_MS);
}

export function stopRemoteAvailabilityWorker(): void {
  if (availabilityInterval) {
    clearInterval(availabilityInterval);
    availabilityInterval = null;
    log.info("remote:availability", "worker stopped");
  }
}
