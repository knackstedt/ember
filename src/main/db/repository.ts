import { getDb } from "./index";
import {
  Game,
  Movie,
  MusicTrack,
  TVShow,
  AppSettings,
  GameEmulatorConfig,
  ButtonMapping,
  Collection,
  CollectionItem,
  SmartFilterGroup,
  StreamingService,
  StreamingFrontpageItem,
  SessionHook,
  RemoteSource,
  Playlist,
} from "../../shared/types";
import { SCAN_SOURCE_ID_PREFIXES, ScanSourceId } from "../../shared/scan-sources";

export function escapeId(id: string): string {
  // SurrealDB record IDs must not contain angle brackets or backticks
  // inside the identifier. We validate and escape aggressively.
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(id)) {
    throw new Error(`Invalid record ID: ${id}`);
  }
  return id;
}

function stripSurround(id: string): string {
  if (id.startsWith("⟨") && id.endsWith("⟩")) {
    return id.slice(1, -1);
  }
  return id;
}

function extractRecordId(raw: unknown): string {
  if (typeof raw === "string") {
    const colonIdx = raw.indexOf(":");
    return stripSurround(colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw);
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === "string") return stripSurround(obj.id);
    if (typeof obj.id === "object" && obj.id !== null) {
      return extractRecordId(obj.id);
    }
    const str = String(raw);
    const colonIdx = str.indexOf(":");
    return stripSurround(colonIdx >= 0 ? str.slice(colonIdx + 1) : str);
  }
  return stripSurround(String(raw));
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
      id: extractRecordId(g.id),
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
    if (normalized.sourceLocation === undefined) normalized.sourceLocation = "local";
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

  async setSessionConfig(
    id: string,
    config: {
      launchCommand?: string | null;
      launchArgs?: string[] | null;
      launchWorkingDir?: string | null;
      launchEnv?: Record<string, string> | null;
      sessionHooks?: SessionHook[] | null;
    },
  ): Promise<void> {
    const db = getDb();
    const params: Record<string, unknown> = {};
    const sets: string[] = [];
    let idx = 0;
    const add = (field: string, value: unknown) => {
      const key = `p${idx++}`;
      params[key] = value;
      sets.push(`${field} = $${key}`);
    };
    if (config.launchCommand !== undefined) {
      add("launchCommand", config.launchCommand);
    }
    if (config.launchArgs !== undefined) {
      add("launchArgs", config.launchArgs);
    }
    if (config.launchWorkingDir !== undefined) {
      add("launchWorkingDir", config.launchWorkingDir);
    }
    if (config.launchEnv !== undefined) {
      add("launchEnv", config.launchEnv);
    }
    if (config.sessionHooks !== undefined) {
      add("sessionHooks", config.sessionHooks);
    }
    if (sets.length > 0) {
      await db.query(
        `UPDATE game:⟨${escapeId(id)}⟩ SET ${sets.join(", ")}`,
        params,
      );
    }
  },

  async setMissing(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE game:⟨${escapeId(id)}⟩ SET missing = $value`, { value });
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE game:⟨${escapeId(id)}⟩`);
  },

  async deleteMissing(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM game WHERE missing = true`);
    return (rows[0] ?? []).length;
  },

  async countBySource(source: ScanSourceId): Promise<number> {
    const db = getDb();
    const prefixes = SCAN_SOURCE_ID_PREFIXES[source];
    const sourceCondition = `source = $source`;
    const prefixConditions = prefixes?.map((p) => `string::starts_with(id, "game:⟨${p}")`) ?? [];
    const where =
      prefixConditions.length > 0
        ? `(${sourceCondition}) OR (${prefixConditions.join(" OR ")})`
        : sourceCondition;
    const result = await db.query<[Game[]]>(`SELECT * FROM game WHERE ${where}`, { source });
    return ((result[0] ?? []) as Game[]).length;
  },

  async deleteBySource(source: ScanSourceId): Promise<number> {
    const db = getDb();
    const prefixes = SCAN_SOURCE_ID_PREFIXES[source];
    const sourceCondition = `source = $source`;
    const prefixConditions = prefixes?.map((p) => `string::starts_with(id, "game:⟨${p}")`) ?? [];
    const where =
      prefixConditions.length > 0
        ? `(${sourceCondition}) OR (${prefixConditions.join(" OR ")})`
        : sourceCondition;
    const rows = await db.query<[any[]]>(`DELETE FROM game WHERE ${where}`, { source });
    return (rows[0] ?? []).length;
  },

  async listCorrupt(): Promise<Game[]> {
    const db = getDb();
    const result = await db.query<[Game[]]>("SELECT * FROM game WHERE corrupt = true ORDER BY title ASC");
    const games = (result[0] ?? []) as Game[];
    return games.map((g) => ({
      ...g,
      id: extractRecordId(g.id),
    }));
  },

  async deleteCorrupt(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM game WHERE corrupt = true`);
    return (rows[0] ?? []).length;
  },
};

/* ------------------------------------------------------------------ */
/*  Movie Repository                                                   */
/* ------------------------------------------------------------------ */

export const MovieRepo = {
  async list(): Promise<Movie[]> {
    const db = getDb();
    const result = await db.query<[Movie[]]>("SELECT * FROM movie ORDER BY title ASC");
    const movies = (result[0] ?? []) as Movie[];
    for (const m of movies) {
      m.id = extractRecordId(m.id);
    }
    return movies;
  },

  async upsert(movie: Movie): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...movie };
    if (normalized.isFavorite === undefined) normalized.isFavorite = false;
    if (normalized.tags === undefined) normalized.tags = [];
    if (normalized.hidden === undefined) normalized.hidden = false;
    if (normalized.sourceLocation === undefined) normalized.sourceLocation = "local";
    await db.query(`UPSERT movie:⟨${escapeId(movie.id)}⟩ CONTENT $movie`, { movie: normalized });
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
    if (progress === null) {
      await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET watchProgress = none`);
    } else {
      await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET watchProgress = $progress`, { progress });
    }
  },

  async setCoverUrl(id: string, url: string): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET coverUrl = $url`, { url });
  },

  async setLastPlayed(id: string, timestamp: number): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET lastPlayed = $ts`, { ts: timestamp });
  },

  async setMissing(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET missing = $value`, { value });
  },

  async setCorrupt(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE movie:⟨${escapeId(id)}⟩ SET corrupt = $value`, { value });
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE movie:⟨${escapeId(id)}⟩`);
  },

  async deleteMissing(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM movie WHERE missing = true`);
    return (rows[0] ?? []).length;
  },

  async listCorrupt(): Promise<Movie[]> {
    const db = getDb();
    const result = await db.query<[Movie[]]>("SELECT * FROM movie WHERE corrupt = true ORDER BY title ASC");
    const movies = (result[0] ?? []) as Movie[];
    for (const m of movies) {
      m.id = extractRecordId(m.id);
    }
    return movies;
  },

  async deleteCorrupt(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM movie WHERE corrupt = true`);
    return (rows[0] ?? []).length;
  },
};

/* ------------------------------------------------------------------ */
/*  Music Repository                                                   */
/* ------------------------------------------------------------------ */

export const MusicRepo = {
  async list(): Promise<MusicTrack[]> {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>("SELECT * FROM music_track ORDER BY title ASC");
    const tracks = (result[0] ?? []) as MusicTrack[];
    for (const t of tracks) {
      t.id = extractRecordId(t.id);
    }
    return tracks;
  },

  async upsert(track: MusicTrack): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...track };
    if (normalized.isFavorite === undefined) normalized.isFavorite = false;
    if (normalized.tags === undefined) normalized.tags = [];
    if (normalized.hidden === undefined) normalized.hidden = false;
    if (normalized.sourceLocation === undefined) normalized.sourceLocation = "local";
    await db.query(`UPSERT music_track:⟨${escapeId(track.id)}⟩ CONTENT $track`, { track: normalized });
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

  async setLastPlayed(id: string, timestamp: number): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET lastPlayed = $ts`, { ts: timestamp });
  },

  async setMissing(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET missing = $value`, { value });
  },

  async setCorrupt(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE music_track:⟨${escapeId(id)}⟩ SET corrupt = $value`, { value });
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE music_track:⟨${escapeId(id)}⟩`);
  },

  async deleteMissing(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM music_track WHERE missing = true`);
    return (rows[0] ?? []).length;
  },

  async listCorrupt(): Promise<MusicTrack[]> {
    const db = getDb();
    const result = await db.query<[MusicTrack[]]>("SELECT * FROM music_track WHERE corrupt = true ORDER BY title ASC");
    const tracks = (result[0] ?? []) as MusicTrack[];
    for (const t of tracks) {
      t.id = extractRecordId(t.id);
    }
    return tracks;
  },

  async deleteCorrupt(): Promise<number> {
    const db = getDb();
    const rows = await db.query<[any[]]>(`DELETE FROM music_track WHERE corrupt = true`);
    return (rows[0] ?? []).length;
  },
};

/* ------------------------------------------------------------------ */
/*  TV Show Repository                                                 */
/* ------------------------------------------------------------------ */

export const TVRepo = {
  async list(): Promise<TVShow[]> {
    const db = getDb();
    const result = await db.query<[TVShow[]]>("SELECT * FROM tv_show ORDER BY title ASC");
    const shows = (result[0] ?? []) as TVShow[];
    for (const s of shows) {
      s.id = extractRecordId(s.id);
    }
    return shows;
  },

  async upsert(show: TVShow): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...show };
    if (normalized.isFavorite === undefined) normalized.isFavorite = false;
    if (normalized.tags === undefined) normalized.tags = [];
    if (normalized.hidden === undefined) normalized.hidden = false;
    if (normalized.sourceLocation === undefined) normalized.sourceLocation = "local";
    await db.query(`UPSERT tv_show:⟨${escapeId(show.id)}⟩ CONTENT $show`, { show: normalized });
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

  async setLastPlayed(id: string, timestamp: number): Promise<void> {
    const db = getDb();
    await db.query(`UPDATE tv_show:⟨${escapeId(id)}⟩ SET lastPlayed = $ts`, { ts: timestamp });
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
/*  Controller Alias Repository                                        */
/* ------------------------------------------------------------------ */

export const AliasRepo = {
  async get(deviceId: string): Promise<string | null> {
    const db = getDb();
    const result = await db.query<[Array<{ alias: string }>]>(
      "SELECT alias FROM controller_alias WHERE deviceId = $deviceId",
      { deviceId },
    );
    const rows = result[0] ?? [];
    return rows[0]?.alias ?? null;
  },

  async set(deviceId: string, alias: string): Promise<void> {
    const db = getDb();
    await db.query(
      "UPSERT controller_alias SET deviceId = $deviceId, alias = $alias WHERE deviceId = $deviceId",
      { deviceId, alias },
    );
  },

  async remove(deviceId: string): Promise<void> {
    const db = getDb();
    await db.query("DELETE FROM controller_alias WHERE deviceId = $deviceId", { deviceId });
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

/* ------------------------------------------------------------------ */
/*  Collection Repository                                              */
/* ------------------------------------------------------------------ */

export const CollectionRepo = {
  async list(): Promise<Collection[]> {
    const db = getDb();
    const result = await db.query<[Collection[]]>("SELECT * FROM collection ORDER BY name ASC");
    return (result[0] ?? []) as Collection[];
  },

  async get(id: string): Promise<Collection | null> {
    const db = getDb();
    const rows = await db.query(`SELECT * FROM collection:⟨${escapeId(id)}⟩`);
    const row = ((rows as any[])[0] ?? [])[0];
    return row ?? null;
  },

  async create(collection: Collection): Promise<void> {
    const db = getDb();
    await db.query(
      `UPSERT collection:⟨${escapeId(collection.id)}⟩ CONTENT $collection`,
      { collection },
    );
  },

  async update(collection: Collection): Promise<void> {
    const db = getDb();
    await db.query(
      `UPSERT collection:⟨${escapeId(collection.id)}⟩ CONTENT $collection`,
      { collection },
    );
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE collection:⟨${escapeId(id)}⟩`);
    await db.query("DELETE FROM collection_item WHERE collectionId = $id", { id });
  },

  async addItem(item: CollectionItem): Promise<void> {
    const db = getDb();
    await db.query(
      `UPSERT collection_item:⟨${escapeId(item.id)}⟩ CONTENT $item`,
      { item },
    );
  },

  async removeItem(collectionId: string, itemId: string): Promise<void> {
    const db = getDb();
    await db.query(
      "DELETE FROM collection_item WHERE collectionId = $collectionId AND itemId = $itemId",
      { collectionId, itemId },
    );
  },

  async listItems(collectionId: string): Promise<CollectionItem[]> {
    const db = getDb();
    const result = await db.query<[CollectionItem[]]>(
      "SELECT * FROM collection_item WHERE collectionId = $collectionId ORDER BY addedAt DESC",
      { collectionId },
    );
    return (result[0] ?? []) as CollectionItem[];
  },

  async evaluateSmartFilter(
    itemType: string,
    filter: SmartFilterGroup,
  ): Promise<string[]> {
    const db = getDb();
    const tableMap: Record<string, string> = {
      game: "game",
      movie: "movie",
      music: "music_track",
      tv: "tv_show",
    };
    const table = tableMap[itemType];
    if (!table) return [];

    // Build SurrealQL WHERE clause from filter group.
    // Each rule gets a unique param key so multiple rules on the same field don't collide.
    let paramCounter = 0;
    const params: Record<string, unknown> = {};

    const buildWhere = (group: SmartFilterGroup): string => {
      const parts = group.rules.map((rule) => {
        if ("logic" in rule) {
          return `(${buildWhere(rule as SmartFilterGroup)})`;
        }
        const r = rule as { field: string; operator: string; value?: unknown };
        if (r.operator === "exists") {
          return `${r.field} != NONE`;
        }
        const key = `p${paramCounter++}`;
        params[key] = r.value;
        switch (r.operator) {
          case "eq":
            return `${r.field} = $${key}`;
          case "ne":
            return `${r.field} != $${key}`;
          case "gt":
            return `${r.field} > $${key}`;
          case "gte":
            return `${r.field} >= $${key}`;
          case "lt":
            return `${r.field} < $${key}`;
          case "lte":
            return `${r.field} <= $${key}`;
          case "contains":
            return `${r.field} CONTAINS $${key}`;
          case "in":
            return `${r.field} INSIDE $${key}`;
          case "startsWith":
            return `string::startsWith(${r.field}, $${key})`;
          case "endsWith":
            return `string::endsWith(${r.field}, $${key})`;
          default:
            return "true";
        }
      });
      return parts.join(` ${group.logic.toUpperCase()} `);
    };

    const where = buildWhere(filter);

    const result = await db.query<[Array<{ id: string | { id: string } }>]>(
      `SELECT id FROM ${table} WHERE ${where}`,
      params,
    );
    const rows = (result[0] ?? []) as Array<{ id: string | { id: string } }>;
    return rows.map((r) => {
      if (typeof r.id === "string") return r.id;
      return (r.id as { id: string }).id ?? String(r.id);
    });
  },
};

/* ------------------------------------------------------------------ */
/*  Playlist Repository                                                */
/* ------------------------------------------------------------------ */

export const PlaylistRepo = {
  async list(): Promise<Playlist[]> {
    const db = getDb();
    const result = await db.query<[Playlist[]]>("SELECT * FROM playlist ORDER BY name ASC");
    const playlists = (result[0] ?? []) as Playlist[];
    return playlists.map((p) => ({
      ...p,
      id: typeof p.id === "string" ? p.id : ((p.id as any)?.id ?? String(p.id)),
      trackIds: p.trackIds ?? [],
    }));
  },

  async get(id: string): Promise<Playlist | null> {
    const db = getDb();
    const rows = await db.query(`SELECT * FROM playlist:⟨${escapeId(id)}⟩`);
    const row = ((rows as any[])[0] ?? [])[0];
    if (!row) return null;
    return {
      ...row,
      id: typeof row.id === "string" ? row.id : ((row.id as any)?.id ?? String(row.id)),
      trackIds: row.trackIds ?? [],
    };
  },

  async create(playlist: Playlist): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...playlist };
    if (normalized.trackIds === undefined) normalized.trackIds = [];
    await db.query(
      `UPSERT playlist:⟨${escapeId(playlist.id)}⟩ CONTENT $playlist`,
      { playlist: normalized },
    );
  },

  async update(playlist: Playlist): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...playlist };
    if (normalized.trackIds === undefined) normalized.trackIds = [];
    await db.query(
      `UPSERT playlist:⟨${escapeId(playlist.id)}⟩ CONTENT $playlist`,
      { playlist: normalized },
    );
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE playlist:⟨${escapeId(id)}⟩`);
  },

  async addTracks(id: string, trackIds: string[]): Promise<void> {
    const db = getDb();
    const existing = await this.get(id);
    if (!existing) throw new Error(`Playlist not found: ${id}`);
    const current = new Set(existing.trackIds ?? []);
    for (const trackId of trackIds) current.add(trackId);
    await db.query(
      `UPDATE playlist:⟨${escapeId(id)}⟩ SET trackIds = $trackIds, updatedAt = $updatedAt`,
      { trackIds: Array.from(current), updatedAt: Date.now() },
    );
  },

  async removeTracks(id: string, trackIds: string[]): Promise<void> {
    const db = getDb();
    const existing = await this.get(id);
    if (!existing) throw new Error(`Playlist not found: ${id}`);
    const toRemove = new Set(trackIds);
    const next = (existing.trackIds ?? []).filter((t) => !toRemove.has(t));
    await db.query(
      `UPDATE playlist:⟨${escapeId(id)}⟩ SET trackIds = $trackIds, updatedAt = $updatedAt`,
      { trackIds: next, updatedAt: Date.now() },
    );
  },

  async reorder(id: string, trackIds: string[]): Promise<void> {
    const db = getDb();
    await db.query(
      `UPDATE playlist:⟨${escapeId(id)}⟩ SET trackIds = $trackIds, updatedAt = $updatedAt`,
      { trackIds, updatedAt: Date.now() },
    );
  },
};

/* ------------------------------------------------------------------ */
/*  Streaming Service Repository                                       */
/* ------------------------------------------------------------------ */

export const StreamingServiceRepo = {
  async list(): Promise<StreamingService[]> {
    const db = getDb();
    const result = await db.query<[StreamingService[]]>(
      "SELECT * FROM streaming_service ORDER BY sortOrder ASC, name ASC",
    );
    const services = (result[0] ?? []) as StreamingService[];
    return services
      .map((s) => ({
        ...s,
        id: typeof s.id === "string" ? s.id : ((s.id as any)?.id ?? String(s.id)),
      }))
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
  },

  async listByCategory(category: string): Promise<StreamingService[]> {
    const db = getDb();
    const result = await db.query<[StreamingService[]]>(
      "SELECT * FROM streaming_service WHERE category = $category AND enabled = true ORDER BY sortOrder ASC, name ASC",
      { category },
    );
    const services = (result[0] ?? []) as StreamingService[];
    return services
      .map((s) => ({
        ...s,
        id: typeof s.id === "string" ? s.id : ((s.id as any)?.id ?? String(s.id)),
      }))
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
  },

  async upsert(service: StreamingService): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...service };
    if (normalized.enabled === undefined) normalized.enabled = true;
    if (normalized.isBuiltin === undefined) normalized.isBuiltin = false;
    if (normalized.sortOrder === undefined) normalized.sortOrder = 0;
    if (normalized.frontpageEnabled === undefined) normalized.frontpageEnabled = true;
    await db.query(
      `UPSERT streaming_service:⟨${escapeId(service.id)}⟩ CONTENT $service`,
      { service: normalized },
    );
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE streaming_service:⟨${escapeId(id)}⟩`);
  },

  async setEnabled(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(
      `UPDATE streaming_service:⟨${escapeId(id)}⟩ SET enabled = $value`,
      { value },
    );
  },

  async setLastPlayed(id: string, timestamp: number): Promise<void> {
    const db = getDb();
    await db.query(
      `UPDATE streaming_service:⟨${escapeId(id)}⟩ SET lastPlayed = $ts`,
      { ts: timestamp },
    );
  },

  async addPlayTime(id: string, seconds: number): Promise<void> {
    const db = getDb();
    await db.query(
      `UPDATE streaming_service:⟨${escapeId(id)}⟩ SET playTime += $seconds`,
      { seconds },
    );
  },
};

/* ------------------------------------------------------------------ */
/*  Streaming Frontpage Item Repository                              */
/* ------------------------------------------------------------------ */

export const StreamingFrontpageItemRepo = {
  async listByService(serviceId: string): Promise<StreamingFrontpageItem[]> {
    const db = getDb();
    const result = await db.query<[StreamingFrontpageItem[]]>(
      `SELECT * FROM streaming_frontpage_item WHERE serviceId = $serviceId ORDER BY sortIndex ASC`,
      { serviceId },
    );
    const items = (result[0] ?? []) as StreamingFrontpageItem[];
    return items.map((it) => ({
      ...it,
      id: typeof it.id === "string" ? it.id : ((it.id as any)?.id ?? String(it.id)),
    }));
  },

  async listAll(): Promise<StreamingFrontpageItem[]> {
    const db = getDb();
    const result = await db.query<[StreamingFrontpageItem[]]>(
      `SELECT * FROM streaming_frontpage_item ORDER BY sortIndex ASC`,
    );
    const items = (result[0] ?? []) as StreamingFrontpageItem[];
    return items.map((it) => ({
      ...it,
      id: typeof it.id === "string" ? it.id : ((it.id as any)?.id ?? String(it.id)),
    }));
  },

  async upsert(item: StreamingFrontpageItem): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...item };
    if (normalized.scrapedAt === undefined) normalized.scrapedAt = Date.now();
    if (normalized.sortIndex === undefined) normalized.sortIndex = 0;
    await db.query(
      `UPSERT streaming_frontpage_item:⟨${escapeId(item.id)}⟩ CONTENT $item`,
      { item: normalized },
    );
  },

  async replaceForService(serviceId: string, items: StreamingFrontpageItem[]): Promise<void> {
    const db = getDb();
    await db.query(`DELETE streaming_frontpage_item WHERE serviceId = $serviceId`, { serviceId });
    for (const item of items) {
      const normalized: Record<string, unknown> = { ...item };
      if (normalized.scrapedAt === undefined) normalized.scrapedAt = Date.now();
      if (normalized.sortIndex === undefined) normalized.sortIndex = 0;
      await db.query(
        `UPSERT streaming_frontpage_item:⟨${escapeId(item.id)}⟩ CONTENT $item`,
        { item: normalized },
      );
    }
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE streaming_frontpage_item:⟨${escapeId(id)}⟩`);
  },

  async clearOld(maxAgeMs: number): Promise<void> {
    const db = getDb();
    const cutoff = Date.now() - maxAgeMs;
    await db.query(`DELETE streaming_frontpage_item WHERE scrapedAt < $cutoff`, { cutoff });
  },
};

/* ------------------------------------------------------------------ */
/*  Remote Source Repository                                           */
/* ------------------------------------------------------------------ */

export const RemoteSourceRepo = {
  async list(): Promise<RemoteSource[]> {
    const db = getDb();
    const result = await db.query<[RemoteSource[]]>(
      "SELECT * FROM remote_source ORDER BY name ASC",
    );
    const sources = (result[0] ?? []) as RemoteSource[];
    return sources.map((s) => ({
      ...s,
      id: typeof s.id === "string" ? s.id : ((s.id as any)?.id ?? String(s.id)),
    }));
  },

  async upsert(source: RemoteSource): Promise<void> {
    const db = getDb();
    const normalized: Record<string, unknown> = { ...source };
    if (normalized.enabled === undefined) normalized.enabled = true;
    await db.query(
      `UPSERT remote_source:⟨${escapeId(source.id)}⟩ CONTENT $source`,
      { source: normalized },
    );
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.query(`DELETE remote_source:⟨${escapeId(id)}⟩`);
  },

  async setEnabled(id: string, value: boolean): Promise<void> {
    const db = getDb();
    await db.query(
      `UPDATE remote_source:⟨${escapeId(id)}⟩ SET enabled = $value`,
      { value },
    );
  },
};
