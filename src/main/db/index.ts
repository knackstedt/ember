import { app } from "electron";
import { join } from "path";
import { mkdirSync } from "fs";
import { createLogger } from "../util/logger";

const log = createLogger("info");

interface Surreal {
  connect(url: string): Promise<unknown>;
  use(opts: { namespace: string; database: string }): Promise<unknown>;
  query<T = unknown>(
    query: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
}
let db: Surreal | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`DB operation timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

async function connectWithRetry(
  instance: Surreal,
  url: string,
  retries = 1,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await withTimeout(instance.connect(url), 6000);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        log.warn(
          "db",
          `Connect attempt ${attempt + 1} failed (${msg}), retrying...`,
        );
        // SurrealKV may hold a file lock briefly after a crash; wait before retry
        await new Promise((r) => setTimeout(r, 800));
      } else {
        throw err;
      }
    }
  }
}

export async function initDb(): Promise<Surreal> {
  if (db) return db;

  const dataDir = join(app.getPath("userData"), "db");
  mkdirSync(dataDir, { recursive: true });

  const [{ Surreal }, { createNodeEngines }] = await Promise.all([
    import("surrealdb"),
    import("@surrealdb/node"),
  ]);
  db = new Surreal({ engines: createNodeEngines() });
  await connectWithRetry(db, `surrealkv://${join(dataDir, "htpc.db")}`, 1);
  await withTimeout(db.use({ namespace: "htpc", database: "main" }), 5000);

  await withTimeout(runMigrations(db), 8000);
  return db;
}

export function getDb(): Surreal {
  if (!db) throw new Error("Database not initialized");
  return db;
}

async function runMigrations(db: Surreal): Promise<void> {
  await db.query(`
    DEFINE TABLE IF NOT EXISTS setting SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS key ON setting TYPE string;
    DEFINE FIELD IF NOT EXISTS value ON setting TYPE any;
    DEFINE INDEX IF NOT EXISTS setting_key ON setting FIELDS key UNIQUE;

    DEFINE TABLE IF NOT EXISTS game SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON game TYPE string;
    DEFINE FIELD IF NOT EXISTS title ON game TYPE string;
    DEFINE FIELD IF NOT EXISTS platform ON game TYPE string;
    DEFINE FIELD IF NOT EXISTS execPath ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS coverUrl ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS coverSource ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS corrupt ON game TYPE option<bool>;
    DEFINE FIELD IF NOT EXISTS bannerUrl ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS description ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS genres ON game TYPE option<array<string>>;
    DEFINE FIELD IF NOT EXISTS releaseYear ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS developer ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS publisher ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS playerCount ON game TYPE option<object>;
    DEFINE FIELD IF NOT EXISTS protonRating ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS steamAppId ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS rawgSlug ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS romPath ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS isFavorite ON game TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS tags ON game TYPE array<string> DEFAULT [];
    DEFINE FIELD IF NOT EXISTS lastPlayed ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS playTime ON game TYPE int DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS rating ON game TYPE option<float>;
    DEFINE FIELD IF NOT EXISTS hidden ON game TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS achievementCount ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS igdbId ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS metacriticScore ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS openCriticScore ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS steamReviewScore ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS steamOwnersEstimate ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS platforms ON game TYPE option<array<string>>;
    DEFINE FIELD IF NOT EXISTS playtime ON game TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS romHash ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS romHashType ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS serialNumber ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS region ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS language ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS mobyGamesId ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS theGamesDbId ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS launchBoxDbId ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS pcgwEngine ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS pcgwSeries ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS wineRunner ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS wineCustomCommand ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS umuCustomCommand ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS videos ON game TYPE option<array<object>>;
    DEFINE FIELD IF NOT EXISTS compressedRomPath ON game TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS compressionFormat ON game TYPE option<string>;

    DEFINE TABLE IF NOT EXISTS movie SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON movie TYPE string;
    DEFINE FIELD IF NOT EXISTS title ON movie TYPE string;
    DEFINE FIELD IF NOT EXISTS filePath ON movie TYPE string;
    DEFINE FIELD IF NOT EXISTS coverUrl ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS backdropUrl ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS description ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS genres ON movie TYPE option<array<string>>;
    DEFINE FIELD IF NOT EXISTS releaseYear ON movie TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS director ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS runtime ON movie TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS resolution ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS codec ON movie TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS tmdbId ON movie TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS isFavorite ON movie TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS tags ON movie TYPE array<string> DEFAULT [];
    DEFINE FIELD IF NOT EXISTS rating ON movie TYPE option<float>;
    DEFINE FIELD IF NOT EXISTS watchProgress ON movie TYPE option<float>;
    DEFINE FIELD IF NOT EXISTS lastPlayed ON movie TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS hidden ON movie TYPE bool DEFAULT false;

    DEFINE TABLE IF NOT EXISTS music_track SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON music_track TYPE string;
    DEFINE FIELD IF NOT EXISTS title ON music_track TYPE string;
    DEFINE FIELD IF NOT EXISTS filePath ON music_track TYPE string;
    DEFINE FIELD IF NOT EXISTS artist ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS album ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS albumArtUrl ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS genre ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS year ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS trackNumber ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS duration ON music_track TYPE option<float>;
    DEFINE FIELD IF NOT EXISTS mbid ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS artistMbid ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS releaseMbid ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS releaseGroupMbid ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS label ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS albumArtist ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS discNumber ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS totalTracks ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS biography ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS mood ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS style ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS country ON music_track TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS tadbArtistId ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS tadbAlbumId ON music_track TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS isFavorite ON music_track TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS tags ON music_track TYPE array<string> DEFAULT [];
    DEFINE FIELD IF NOT EXISTS hidden ON music_track TYPE bool DEFAULT false;

    DEFINE TABLE IF NOT EXISTS tv_show SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON tv_show TYPE string;
    DEFINE FIELD IF NOT EXISTS title ON tv_show TYPE string;
    DEFINE FIELD IF NOT EXISTS dirPath ON tv_show TYPE string;
    DEFINE FIELD IF NOT EXISTS coverUrl ON tv_show TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS backdropUrl ON tv_show TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS description ON tv_show TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS genres ON tv_show TYPE option<array<string>>;
    DEFINE FIELD IF NOT EXISTS firstAirYear ON tv_show TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS creator ON tv_show TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS seasons ON tv_show TYPE option<array<object>>;
    DEFINE FIELD IF NOT EXISTS tmdbId ON tv_show TYPE option<int>;
    DEFINE FIELD IF NOT EXISTS isFavorite ON tv_show TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS tags ON tv_show TYPE array<string> DEFAULT [];
    DEFINE FIELD IF NOT EXISTS rating ON tv_show TYPE option<float>;
    DEFINE FIELD IF NOT EXISTS hidden ON tv_show TYPE bool DEFAULT false;

    DEFINE TABLE IF NOT EXISTS controller_mapping SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS deviceId ON controller_mapping TYPE string;
    DEFINE FIELD IF NOT EXISTS inputCode ON controller_mapping TYPE string;
    DEFINE FIELD IF NOT EXISTS action ON controller_mapping TYPE string;
    DEFINE INDEX IF NOT EXISTS mapping_unique ON controller_mapping FIELDS deviceId, inputCode UNIQUE;

    DEFINE TABLE IF NOT EXISTS broken_flash_game SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON broken_flash_game TYPE string;
    DEFINE FIELD IF NOT EXISTS gameId ON broken_flash_game TYPE string;
    DEFINE FIELD IF NOT EXISTS title ON broken_flash_game TYPE string;
    DEFINE FIELD IF NOT EXISTS romPath ON broken_flash_game TYPE string;
    DEFINE FIELD IF NOT EXISTS reason ON broken_flash_game TYPE string;
    DEFINE FIELD IF NOT EXISTS detectedAt ON broken_flash_game TYPE int;
    DEFINE INDEX IF NOT EXISTS broken_game_id ON broken_flash_game FIELDS gameId UNIQUE;

    DEFINE TABLE IF NOT EXISTS game_config SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON game_config TYPE string;
    DEFINE FIELD IF NOT EXISTS shader ON game_config TYPE option<string>;

    DEFINE TABLE IF NOT EXISTS collection SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON collection TYPE string;
    DEFINE FIELD IF NOT EXISTS name ON collection TYPE string;
    DEFINE FIELD IF NOT EXISTS icon ON collection TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS color ON collection TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS description ON collection TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS itemType ON collection TYPE string;
    DEFINE FIELD IF NOT EXISTS type ON collection TYPE string;
    DEFINE FIELD IF NOT EXISTS filter ON collection TYPE option<object>;
    DEFINE FIELD IF NOT EXISTS sortOrder ON collection TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS sortDirection ON collection TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS createdAt ON collection TYPE int;
    DEFINE FIELD IF NOT EXISTS updatedAt ON collection TYPE int;
    DEFINE INDEX IF NOT EXISTS collection_name ON collection FIELDS name;

    DEFINE TABLE IF NOT EXISTS collection_item SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON collection_item TYPE string;
    DEFINE FIELD IF NOT EXISTS collectionId ON collection_item TYPE string;
    DEFINE FIELD IF NOT EXISTS itemId ON collection_item TYPE string;
    DEFINE FIELD IF NOT EXISTS itemType ON collection_item TYPE string;
    DEFINE FIELD IF NOT EXISTS addedAt ON collection_item TYPE int;
    DEFINE INDEX IF NOT EXISTS collection_item_lookup ON collection_item FIELDS collectionId, itemId;

    DEFINE TABLE IF NOT EXISTS streaming_service SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS id ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS name ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS category ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS url ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS color ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS textColor ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS icon ON streaming_service TYPE string;
    DEFINE FIELD IF NOT EXISTS desktopApp ON streaming_service TYPE option<string>;
    DEFINE FIELD IF NOT EXISTS desktopAppArgs ON streaming_service TYPE option<array<string>>;
    DEFINE FIELD IF NOT EXISTS enabled ON streaming_service TYPE bool DEFAULT true;
    DEFINE FIELD IF NOT EXISTS isBuiltin ON streaming_service TYPE bool DEFAULT false;
    DEFINE FIELD IF NOT EXISTS sortOrder ON streaming_service TYPE int DEFAULT 0;
  `);

  // Migrate old raw local coverUrl paths → ember://media protocol
  try {
    const [absPaths] = await db.query<[{ id: string; coverUrl: string }[]]>(
      `SELECT id, coverUrl FROM game WHERE string::starts_with(coverUrl, "/")`,
    );
    for (const row of absPaths ?? []) {
      await db.query(`UPDATE ${row.id} SET coverUrl = $url`, {
        url: `ember://media/${row.coverUrl}`,
      });
    }

    const [fileUrls] = await db.query<[{ id: string; coverUrl: string }[]]>(
      `SELECT id, coverUrl FROM game WHERE string::starts_with(coverUrl, "file://")`,
    );
    for (const row of fileUrls ?? []) {
      await db.query(`UPDATE ${row.id} SET coverUrl = $url`, {
        url: `ember://media/${row.coverUrl.slice("file://".length)}`,
      });
    }
  } catch (err) {
    log.warn("db", `raw coverUrl migration failed: ${err}`);
  }
}
