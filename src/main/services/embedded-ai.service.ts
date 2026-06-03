import {
  SmartFilterGroup,
  SmartFilterRule,
  FilterOperator,
  CollectionItemType,
  AiGroup,
} from "../../shared/types";

/* ------------------------------------------------------------------ */
/*  Embedding pipeline (lazy singleton)                              */
/*  @xenova/transformers is ESM-only — use dynamic import()           */
/* ------------------------------------------------------------------ */

const MODEL = "Xenova/all-MiniLM-L6-v2";

type PipelineFn = (task: string, model: string, opts?: object) => Promise<unknown>;

let embedder: unknown | null = null;
let modelLoading = false;
let modelError: Error | null = null;

async function getEmbedder(): Promise<PipelineFn | null> {
  if (embedder) return embedder as PipelineFn;
  if (modelLoading) {
    // wait for current load
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return embedder as PipelineFn;
  }
  if (modelError) return null;

  modelLoading = true;
  try {
    const { pipeline } = await import("@xenova/transformers");
    embedder = await pipeline("feature-extraction", MODEL, { quantized: true });
    return embedder as PipelineFn;
  } catch (err) {
    modelError = err as Error;
    console.error("Failed to load embedding model:", err);
    return null;
  } finally {
    modelLoading = false;
  }
}

export async function isAiAvailable(): Promise<boolean> {
  const e = await getEmbedder();
  return e !== null;
}

/* ------------------------------------------------------------------ */
/*  Cosine similarity helpers                                         */
/* ------------------------------------------------------------------ */

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const e = await getEmbedder();
  if (!e) throw new Error("Embedding model not available");
  const out = await e(texts, { pooling: "mean", normalize: true }) as {
    dims: number[];
    data: Float32Array;
  };
  const dim = out.dims[1] ?? 384;
  const data = out.data;
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    const start = i * dim;
    vectors.push(data.slice(start, start + dim));
  }
  return vectors;
}

async function embedOne(text: string): Promise<Float32Array> {
  const [vec] = await embed([text]);
  return vec;
}

/* ------------------------------------------------------------------ */
/*  Filter template library                                           */
/* ------------------------------------------------------------------ */

interface FilterTemplate {
  id: string;
  description: string;
  itemTypes: CollectionItemType[];
  buildFilter: (params: Record<string, string>) => SmartFilterGroup;
  paramHints: Record<string, string[]>; // key -> example values for extraction
}

function rule(
  field: string,
  operator: FilterOperator,
  value?: unknown,
): SmartFilterRule {
  return { field, operator, ...(value !== undefined ? { value } : {}) };
}

function group(logic: "and" | "or", rules: (SmartFilterRule | SmartFilterGroup)[]): SmartFilterGroup {
  return { logic, rules };
}

const TEMPLATES: FilterTemplate[] = [
  {
    id: "favorites",
    description: "show only favorite items starred liked loved bookmarks",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: () => group("and", [rule("isFavorite", "eq", true)]),
    paramHints: {},
  },
  {
    id: "highly-rated",
    description: "best top rated highly scored amazing excellent great quality",
    itemTypes: ["game", "movie", "tv", "mixed"],
    buildFilter: (p) => {
      const threshold = parseFloat(p.rating ?? "7");
      return group("and", [rule("rating", "gte", threshold)]);
    },
    paramHints: { rating: ["7", "8", "9", "8.5"] },
  },
  {
    id: "genre",
    description: "items in a specific genre category style type like action sci-fi horror",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: (p) => {
      const genre = (p.genre ?? "").toLowerCase();
      return group("and", [rule("genres", "contains", genre)]);
    },
    paramHints: { genre: ["action", "sci-fi", "horror", "rpg", "comedy", "drama"] },
  },
  {
    id: "year",
    description: "released in a specific year decade time period modern old classic",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: (p) => {
      const year = parseInt(p.year ?? "2000", 10);
      if (p.decade) {
        const start = parseInt(p.decade, 10);
        return group("and", [
          rule("releaseYear", "gte", start),
          rule("releaseYear", "lt", start + 10),
        ]);
      }
      if (p.range) {
        const [s, e] = p.range.split("-").map((x) => parseInt(x.trim(), 10));
        return group("and", [
          rule("releaseYear", "gte", s),
          rule("releaseYear", "lte", e),
        ]);
      }
      return group("and", [rule("releaseYear", "eq", year)]);
    },
    paramHints: { year: ["2020", "1990"], decade: ["1980", "1990", "2000"], range: ["1990-2000"] },
  },
  {
    id: "recent",
    description: "recently added new latest fresh items",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: () => group("and", []), // no-op: UI can sort by added
    paramHints: {},
  },
  {
    id: "unplayed",
    description: "never played untouched unstarted backlog",
    itemTypes: ["game", "movie", "tv", "mixed"],
    buildFilter: () => group("and", [
      rule("playTime", "eq", 0),
      rule("lastPlayed", "exists", false),
    ]),
    paramHints: {},
  },
  {
    id: "recently-played",
    description: "played recently last week month",
    itemTypes: ["game", "movie", "tv", "mixed"],
    buildFilter: (p) => {
      const days = parseInt(p.days ?? "7", 10);
      const cutoff = Date.now() - days * 86400000;
      return group("and", [rule("lastPlayed", "gte", cutoff)]);
    },
    paramHints: { days: ["7", "30", "90"] },
  },
  {
    id: "platform",
    description: "items on a specific platform system console emulator",
    itemTypes: ["game", "mixed"],
    buildFilter: (p) => group("and", [rule("platform", "eq", p.platform ?? "")]),
    paramHints: { platform: ["steam", "nes", "snes", "psx", "gba"] },
  },
  {
    id: "proton-good",
    description: "games that run well on linux proton platinum gold",
    itemTypes: ["game", "mixed"],
    buildFilter: () => group("or", [
      rule("protonRating", "eq", "platinum"),
      rule("protonRating", "eq", "gold"),
    ]),
    paramHints: {},
  },
  {
    id: "multiplayer",
    description: "multiplayer co-op couch co-op local multiplayer party games",
    itemTypes: ["game", "mixed"],
    buildFilter: () => group("and", [
      rule("playerCount", "exists", true),
      rule("playerCount", "gte", 2),
    ]),
    paramHints: {},
  },
  {
    id: "developer",
    description: "items by a specific developer creator studio artist director",
    itemTypes: ["game", "movie", "tv", "mixed"],
    buildFilter: (p) => {
      const name = p.name ?? "";
      return group("or", [
        rule("developer", "contains", name),
        rule("director", "contains", name),
        rule("creator", "contains", name),
        rule("artist", "contains", name),
      ]);
    },
    paramHints: { name: ["nintendo", "capcom", "nolan"] },
  },
  {
    id: "title-contains",
    description: "title name includes contains word phrase",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: (p) => group("and", [rule("title", "contains", p.query ?? "")]),
    paramHints: { query: [] },
  },
  {
    id: "tag",
    description: "items with a specific tag label",
    itemTypes: ["game", "movie", "music", "tv", "mixed"],
    buildFilter: (p) => group("and", [rule("tags", "contains", p.tag ?? "")]),
    paramHints: { tag: ["retro", "indie", "classic"] },
  },
  {
    id: "watched",
    description: "movies or shows already watched seen finished",
    itemTypes: ["movie", "tv", "mixed"],
    buildFilter: () => group("and", [rule("watchProgress", "gt", 0)]),
    paramHints: {},
  },
  {
    id: "unwatched",
    description: "unwatched unseen not watched movies shows",
    itemTypes: ["movie", "tv", "mixed"],
    buildFilter: () => group("and", [
      group("or", [
        rule("watchProgress", "eq", 0),
        rule("watchProgress", "exists", false),
      ]),
    ]),
    paramHints: {},
  },
  {
    id: "runtime-short",
    description: "short quick brief movies under minutes runtime",
    itemTypes: ["movie", "mixed"],
    buildFilter: (p) => {
      const mins = parseInt(p.minutes ?? "90", 10);
      return group("and", [rule("runtime", "lte", mins)]);
    },
    paramHints: { minutes: ["90", "120", "60"] },
  },
  {
    id: "album",
    description: "songs tracks from a specific album record",
    itemTypes: ["music", "mixed"],
    buildFilter: (p) => group("and", [rule("album", "contains", p.album ?? "")]),
    paramHints: { album: [] },
  },
  {
    id: "artist",
    description: "music by a specific artist band performer",
    itemTypes: ["music", "mixed"],
    buildFilter: (p) => group("and", [rule("artist", "contains", p.artist ?? "")]),
    paramHints: { artist: [] },
  },
];

/* pre-compute template embeddings once on first use */
let templateVectors: { template: FilterTemplate; vector: Float32Array }[] | null = null;

async function getTemplateVectors(): Promise<{ template: FilterTemplate; vector: Float32Array }[]> {
  if (templateVectors) return templateVectors;
  const texts = TEMPLATES.map((t) => t.description);
  const vectors = await embed(texts);
  templateVectors = TEMPLATES.map((t, i) => ({ template: t, vector: vectors[i] }));
  return templateVectors;
}

/* ------------------------------------------------------------------ */
/*  Parameter extraction                                              */
/* ------------------------------------------------------------------ */

function extractParams(query: string, template: FilterTemplate): Record<string, string> {
  const lower = query.toLowerCase();
  const params: Record<string, string> = {};

  // Extract years/decades
  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) params.year = yearMatch[1];

  const decadeMatch = lower.match(/\b(19\d{2}|20\d{2})s?\b/);
  if (decadeMatch && !params.year) params.decade = decadeMatch[1];

  const rangeMatch = lower.match(/\b(19\d{2}|20\d{2})\s*-\s*(19\d{2}|20\d{2})\b/);
  if (rangeMatch) params.range = `${rangeMatch[1]}-${rangeMatch[2]}`;

  // Extract rating thresholds
  const ratingMatch = lower.match(/(?:rating|rated)\s*(?:above|over|>|\s*:\s*)?\s*(\d+(?:\.\d+)?)/);
  if (ratingMatch) params.rating = ratingMatch[1];

  // Extract days for "recently played"
  const daysMatch = lower.match(/(\d+)\s*(?:day|week|month)s?/);
  if (daysMatch) {
    const num = parseInt(daysMatch[1], 10);
    if (lower.includes("week")) params.days = String(num * 7);
    else if (lower.includes("month")) params.days = String(num * 30);
    else params.days = String(num);
  }

  // Extract minutes for runtime
  const minsMatch = lower.match(/(\d+)\s*(?:min|minute)/);
  if (minsMatch) params.minutes = minsMatch[1];

  // Extract platform (from known list)
  const platforms = ["steam", "gog", "heroic", "lutris", "dolphin-gc", "dolphin-wii",
    "nes", "snes", "gb", "gba", "n64", "genesis", "sms", "gamegear", "pce", "psx",
    "nds", "dreamcast", "flash", "dos", "desktop"];
  for (const p of platforms) {
    if (lower.includes(p.replace("-", " ")) || lower.includes(p)) {
      params.platform = p;
      break;
    }
  }

  // Extract developer/director/artist ("by X" or "from X")
  const byMatch = query.match(/(?:by|from|directed by|created by|studio)\s+([A-Za-z][A-Za-z\s]+)/i);
  if (byMatch) params.name = byMatch[1].trim();

  // Extract album
  const albumMatch = query.match(/(?:album|record)\s+["']?([^"']+)["']?/i);
  if (albumMatch) params.album = albumMatch[1].trim();

  // Extract artist
  const artistMatch = query.match(/(?:artist|band)\s+["']?([^"']+)["']?/i);
  if (artistMatch) params.artist = artistMatch[1].trim();

  // Extract genre (match common genres)
  const commonGenres = ["action", "adventure", "rpg", "strategy", "simulation",
    "sports", "racing", "puzzle", "platformer", "shooter", "fighting", "horror",
    "sci-fi", "fantasy", "comedy", "drama", "thriller", "romance", "documentary",
    "animation", "rock", "pop", "jazz", "classical", "hip-hop", "electronic",
    "metal", "blues", "folk", "indie"];
  for (const g of commonGenres) {
    if (lower.includes(g)) {
      params.genre = g;
      break;
    }
  }

  // For title-contains: extract the query phrase after "with" or "containing" or just the whole query minus template words
  if (template.id === "title-contains") {
    const cleaned = query
      .replace(/items?\s*(?:with|containing|that include|named)?/gi, "")
      .replace(/^\s*"?\s*|\s*"?\s*$/g, "");
    if (cleaned) params.query = cleaned;
  }

  // For tag
  if (template.id === "tag") {
    const tagMatch = query.match(/(?:tagged?\s*(?:as)?|tag|label)\s+["']?([^"']+)["']?/i);
    if (tagMatch) params.tag = tagMatch[1].trim();
  }

  return params;
}

/* ------------------------------------------------------------------ */
/*  Natural language → SmartFilterGroup                                 */
/* ------------------------------------------------------------------ */

export async function naturalLanguageToFilter(
  query: string,
  itemType: CollectionItemType,
): Promise<SmartFilterGroup | null> {
  try {
    const vectors = await getTemplateVectors();
    if (!vectors) return null;

    const qVec = await embedOne(query);

    // Score templates by cosine similarity, filtering by item type
    let best: { template: FilterTemplate; score: number } | null = null;
    for (const { template, vector } of vectors) {
      if (!template.itemTypes.includes(itemType) && !template.itemTypes.includes("mixed")) continue;
      const score = cosine(qVec, vector);
      if (!best || score > best.score) {
        best = { template, score };
      }
    }

    if (!best || best.score < 0.3) {
      // Fallback: title contains the whole query
      return group("and", [rule("title", "contains", query)]);
    }

    const params = extractParams(query, best.template);
    return best.template.buildFilter(params);
  } catch (err) {
    console.error("NL filter generation failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Smart auto-grouping (semantic clustering)                         */
/* ------------------------------------------------------------------ */

interface EmbeddableItem {
  id: string;
  title: string;
  genres?: string[];
  tags?: string[];
  description?: string;
  platform?: string;
  artist?: string;
  album?: string;
  genre?: string;
}

function itemToText(item: EmbeddableItem): string {
  const parts: string[] = [item.title];
  if (item.genres?.length) parts.push(...item.genres);
  if (item.genre) parts.push(item.genre);
  if (item.tags?.length) parts.push(...item.tags);
  if (item.description) parts.push(item.description.slice(0, 200));
  if (item.platform) parts.push(item.platform);
  if (item.artist) parts.push(item.artist);
  if (item.album) parts.push(item.album);
  return parts.join(". ");
}

function extractLabel(items: EmbeddableItem[]): string {
  // Try to find common genre/tag
  const freq = new Map<string, number>();
  for (const item of items) {
    for (const g of item.genres ?? []) {
      const k = g.toLowerCase().trim();
      if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    if (item.genre) {
      const k = item.genre.toLowerCase().trim();
      if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    for (const t of item.tags ?? []) {
      const k = t.toLowerCase().trim();
      if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }

  let best: [string, number] | null = null;
  for (const [k, v] of freq) {
    if (!best || v > best[1]) best = [k, v];
  }

  if (best && best[1] >= items.length * 0.4) {
    return best[0].charAt(0).toUpperCase() + best[0].slice(1);
  }

  // Fallback: use the most common platform
  const platforms = new Map<string, number>();
  for (const item of items) {
    if (item.platform) {
      platforms.set(item.platform, (platforms.get(item.platform) ?? 0) + 1);
    }
  }
  let pbest: [string, number] | null = null;
  for (const [k, v] of platforms) {
    if (!pbest || v > pbest[1]) pbest = [k, v];
  }
  if (pbest && pbest[1] >= items.length * 0.5) {
    return pbest[0].charAt(0).toUpperCase() + pbest[0].slice(1);
  }

  return "Mixed";
}

export async function aiGroupItems(
  items: EmbeddableItem[],
  groupCount: number,
): Promise<AiGroup[]> {
  if (items.length === 0) return [];
  if (groupCount <= 1) {
    return [{ label: "All", itemIds: items.map((i) => i.id), centerItemId: items[0].id }];
  }

  const texts = items.map(itemToText);
  const vectors = await embed(texts);

  // Greedy clustering: pick first item as centroid, then add close items or start new cluster
  const clusters: { centroid: Float32Array; members: number[] }[] = [];
  const SIM_THRESHOLD = 0.55;

  for (let i = 0; i < items.length; i++) {
    let placed = false;
    for (const cluster of clusters) {
      if (cosine(vectors[i], cluster.centroid) >= SIM_THRESHOLD) {
        cluster.members.push(i);
        // update centroid as mean
        const n = cluster.members.length;
        for (let d = 0; d < cluster.centroid.length; d++) {
          cluster.centroid[d] = (cluster.centroid[d] * (n - 1) + vectors[i][d]) / n;
        }
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ centroid: new Float32Array(vectors[i]), members: [i] });
    }
  }

  // If we have too many clusters, merge the most similar ones until we reach groupCount
  while (clusters.length > groupCount) {
    let bestPair: [number, number] | null = null;
    let bestSim = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = cosine(clusters[i].centroid, clusters[j].centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestPair = [i, j];
        }
      }
    }
    if (!bestPair) break;
    const [a, b] = bestPair;
    const merged = [...clusters[a].members, ...clusters[b].members];
    const newCentroid = new Float32Array(clusters[a].centroid.length);
    for (let d = 0; d < newCentroid.length; d++) {
      let sum = 0;
      for (const idx of merged) sum += vectors[idx][d];
      newCentroid[d] = sum / merged.length;
    }
    clusters.splice(b, 1);
    clusters[a] = { centroid: newCentroid, members: merged };
  }

  // If too few clusters, split the largest
  while (clusters.length < groupCount && clusters.some((c) => c.members.length > 2)) {
    const largest = clusters.reduce((big, c, i) => (c.members.length > big.members.length ? { ...c, index: i } : big), { ...clusters[0], index: 0 });
    // Find two items in the cluster that are farthest apart
    let maxDist = -1;
    let splitA = -1;
    let splitB = -1;
    for (const i of largest.members) {
      for (const j of largest.members) {
        if (i >= j) continue;
        const dist = 1 - cosine(vectors[i], vectors[j]);
        if (dist > maxDist) {
          maxDist = dist;
          splitA = i;
          splitB = j;
        }
      }
    }
    if (splitA < 0) break;

    const newA: number[] = [splitA];
    const newB: number[] = [splitB];
    for (const idx of largest.members) {
      if (idx === splitA || idx === splitB) continue;
      const simA = cosine(vectors[idx], vectors[splitA]);
      const simB = cosine(vectors[idx], vectors[splitB]);
      (simA >= simB ? newA : newB).push(idx);
    }

    clusters[largest.index] = {
      centroid: vectors[splitA],
      members: newA,
    };
    clusters.push({
      centroid: vectors[splitB],
      members: newB,
    });
  }

  return clusters.map((cluster) => {
    const clusterItems = cluster.members.map((i) => items[i]);
    return {
      label: extractLabel(clusterItems),
      itemIds: clusterItems.map((i) => i.id),
      centerItemId: clusterItems[0].id,
    };
  });
}
