import { getDb } from "./index";
import {
  Game,
  Movie,
  MusicTrack,
  TVShow,
  AppSettings,
  GameEmulatorConfig,
  ButtonMapping,
} from "../../shared/types";

function escapeId(id: string): string {
  // SurrealDB record IDs must not contain angle brackets or backticks
  // inside the identifier. We validate and escape aggressively.
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
    throw new Error(`Invalid record ID: ${id}`);
  }
  return id;
}

/* ------------------------------------------------------------------ */
/*  Game Repository                                                    */
/* ------------------------------------------------------------------ */

export const GameRepo = {
  async list(): Promise<Game[]> {
    const db = getDb();
    const result = await db.query<[Game[]]>("SELECT * FROM game ORDER BY title ASC");
    const games = (result[0] ?? []) as Game[];
    return games.map((g) => ({
      ...g,
      id: typeof g.id === "string" ? g.id : ((g.id as any)?.id ?? String(g.id)),
    }));
  },

  async upsert(game: Game): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...game };
    if (normalized.isFavorite === undefined) normalized.isFavorite = false;
    if (normalized.tags === undefined) normalized.tags = [];
    if (normalized.playTime === undefined) normalized.playTime = 0;
    if (normalized.rating === undefined) normalized.rating = 0;
    if (normalized.lastPlayed === undefined) normalized.lastPlayed = 0;
    if (normalized.hidden === undefined) normalized.hidden = false;
    await db.query(`UPSERT game:⟨${escapeId(game.id)}⟩ CONTENT $game`, { game: normalized });
  },

  async setFavorite(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET isFavorite = $value`, { value });
  },

  async setTags(id: string, tags: string[]): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET tags = $tags`, { tags });
  },

  async setHidden(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET hidden = $value`, { value });
  },

  async setLastPlayed(id: string, timestamp: number): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET lastPlayed = $ts`, { ts: timestamp });
  },

  async addPlayTime(id: string, seconds: number): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET playTime += $seconds`, { seconds });
  },

  async setCoverUrl(id: string, url: string): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET coverUrl = $url`, { url });
  },

  async setCorrupt(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET corrupt = $value`, { value });
  },

  async getEmulatorConfig(id: string): Promise<GameEmulatorConfig | null> {
    const db = getDb();
    const rows = await db.query(`SELECT shader FROM game_config:⟨${escapeId(id)}⟩`);
    const row = ((rows as any[])[0] ?? [])[0];
    return (row ?? {}) as GameEmulatorConfig;
  },

  async setEmulatorConfig(id: string, config: GameEmulatorConfig): Promise<void> {
    const db = getDb();
    await db.query(`UPSERT game_config:⟨${escapeId(id)}⟩ CONTENT $config`, { config });
  },
};

/* ------------------------------------------------------------------ */
/*  Movie Repository                                                   */
/* ------------------------------------------------------------------ */

export const MovieRepo = {
  async list(): Promise<Movie[]> {
    const db = getDb();
    const result = await db.query<[Movie[]]>("SELECT * FROM movie ORDER BY title ASC");
    return (result[0] ?? []) as Movie[];
  },

  async upsert(movie: Movie): Promise<void> {
    const db = getDb();
    await db.query(`UPSERT movie:⟨${escapeId(movie.id)}⟩ CONTENT $movie`, { movie });
  },

  async setFavorite(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET isFavorite = $value`, { value });
  },

  async setTags(id: string, tags: string[]): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET tags = $tags`, { tags });
  },

  async setHidden(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET hidden = $value`, { value });
  },

  async setProgress(id: string, progress: number | null): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET watchProgress = $progress`, { progress });
  },

  async setCoverUrl(id: string, url: string): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET coverUrl = $url`, { url });
  },
};

/* ------------------------------------------------------------------ */
/*  Music Repository                                                   */
/* ------------------------------------------------------------------ */

export const MusicRepo = {
  async list(): Promise<MusicTrack[]> {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>("SELECT * FROM music_track ORDER BY title ASC");
    return (result[0] ?? []) as MusicTrack[];
  },

  async upsert(track: MusicTrack): Promise<void> {
    const db = getDb();
    await db.query(`UPSERT music_track:⟨${escapeId(track.id)}⟩ CONTENT $track`, { track });
  },

  async setFavorite(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET isFavorite = $value`, { value });
  },

  async setTags(id: string, tags: string[]): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET tags = $tags`, { tags });
  },

  async setHidden(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET hidden = $value`, { value });
  },
};

/* ------------------------------------------------------------------ */
/*  TV Show Repository                                                 */
/* ------------------------------------------------------------------ */

export const TVRepo = {
  async list(): Promise<TVShow[]> {
    const db = getDb();
    const result = await db.query<[TVShow[]]>("SELECT * FROM tv_show ORDER BY title ASC");
    return (result[0] ?? []) as TVShow[];
  },

  async upsert(show: TVShow): Promise<void> {
    const db = getDb();
    await db.query(`UPSERT tv_show:⟨${escapeId(show.id)}⟩ CONTENT $show`, { show });
  },

  async setFavorite(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${escapeId(id)}⟩ SET isFavorite = $value`, { value });
  },

  async setTags(id: string, tags: string[]): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${escapeId(id)}⟩ SET tags = $tags`, { tags });
  },

  async setHidden(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${escapeId(id)}⟩ SET hidden = $value`, { value });
  },

  async setCoverUrl(id: string, url: string): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${escapeId(id)}⟩ SET coverUrl = $url`, { url });
  },
};

/* ------------------------------------------------------------------ */
/*  Settings Repository                                                */
/* ------------------------------------------------------------------ */

export const SettingsRepo = {
  async getAll(): Promise<Record<string, unknown>> {
    const db = getDb();
    const rows = await db.query<[{ key: string; value: unknown }[]]>(
      "SELECT key, value FROM setting",
    );
    const result: Record<string, unknown> = {};
    for (const row of rows[0] ?? []) {
      result[row.key] = row.value;
    }
    return result;
  },

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const db = getDb();
    await db.query(
      "UPSERT setting SET key = $key, value = $value WHERE key = $key",
      { key, value },
    );
  },

  async setBatch(partial: Partial<AppSettings>): Promise<void> {
    const db = getDb();
    // SurrealDB does not support cross-statement transactions in the JS
    // client, so we batch into a single query string.
    const statements = Object.entries(partial).map(
      (_, i) => `UPSERT setting SET key = $key${i}, value = $value${i} WHERE key = $key${i}`,
    );
    const params: Record<string, unknown> = {};
    let idx = 0;
    for (const [key, value] of Object.entries(partial)) {
      params[`key${idx}`] = key;
      params[`value${idx}`] = value;
      idx++;
    }
    await db.query(statements.join("; "), params);
  },
};

/* ------------------------------------------------------------------ */
/*  Controller Mapping Repository                                      */
/* ------------------------------------------------------------------ */

export const MappingRepo = {
  async get(deviceId: string): Promise<ButtonMapping[]> {
    const db = getDb();
    const result = await db.query<[ButtonMapping[]]>(
      "SELECT * FROM controller_mapping WHERE deviceId = $deviceId",
      { deviceId },
    );
    return (result[0] ?? []) as ButtonMapping[];
  },

  async set(deviceId: string, inputCode: string, action: string): Promise<void> {
    const db = getDb();
    await db.query(
      "UPSERT controller_mapping SET deviceId = $deviceId, inputCode = $inputCode, action = $action WHERE deviceId = $deviceId AND inputCode = $inputCode",
      { deviceId, inputCode, action },
    );
  },

  async reset(deviceId: string): Promise<void> {
    const db = getDb();
    await db.query("DELETE FROM controller_mapping WHERE deviceId = $deviceId", { deviceId });
  },
};

/* ------------------------------------------------------------------ */
/*  Broken Flash Game Repository                                       */
/* ------------------------------------------------------------------ */

export const BrokenFlashRepo = {
  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE broken_flash_game:⟨${escapeId(id)}⟩`);
  },

  async get(id: string): Promise<unknown | null> {
    const db = getDb();
    const rows = await db.query(`SELECT * FROM broken_flash_game:⟨${escapeId(id)}⟩`);
    const row = ((rows as any[])[0] ?? [])[0];
    return row ?? null;
  },
};
