import { BaseStreamingAdapter, StreamingAdapterConfig } from "./adapters/base.adapter";
import { SpotifyAdapter } from "./adapters/spotify.adapter";
import { getDb } from "../../db";
import { escapeId } from "../../db/repository";
import { createLogger } from "../../util/logger";

const log = createLogger("info");

export type AdapterFactory = (serviceId: string) => BaseStreamingAdapter | null;

const ADAPTER_REGISTRY: Record<string, new () => BaseStreamingAdapter> = {
  spotify: SpotifyAdapter,
};

export function createAdapter(serviceId: string): BaseStreamingAdapter | null {
  const ctor = ADAPTER_REGISTRY[serviceId];
  if (!ctor) return null;
  return new ctor();
}

export function hasDeepAdapter(serviceId: string): boolean {
  return serviceId in ADAPTER_REGISTRY;
}

export async function loadAdapterConfig(serviceId: string): Promise<StreamingAdapterConfig> {
  try {
    const db = getDb();
    const result = await db.query<[{ adapterConfig?: string }[]]>(
      `SELECT adapterConfig FROM streaming_service:⟨${escapeId(serviceId)}⟩`,
    );
    const row = result[0]?.[0];
    if (row?.adapterConfig) {
      try {
        return JSON.parse(row.adapterConfig) as StreamingAdapterConfig;
      } catch {
        return {};
      }
    }
  } catch (err) {
    log.warn("streaming:player", `Failed to load adapter config for ${serviceId}: ${err}`);
  }
  return {};
}

export async function saveAdapterConfig(serviceId: string, config: StreamingAdapterConfig): Promise<void> {
  try {
    const db = getDb();
    await db.query(
      `UPDATE streaming_service:⟨${escapeId(serviceId)}⟩ SET adapterConfig = $config`,
      { config: JSON.stringify(config) },
    );
  } catch (err) {
    log.error("streaming:player", `Failed to save adapter config for ${serviceId}: ${err}`);
    throw err;
  }
}

/** Active adapter instances keyed by service ID */
const activeAdapters = new Map<string, BaseStreamingAdapter>();

export function getActiveAdapter(serviceId: string): BaseStreamingAdapter | null {
  return activeAdapters.get(serviceId) ?? null;
}

export async function initializeAdapter(serviceId: string): Promise<BaseStreamingAdapter | null> {
  const existing = activeAdapters.get(serviceId);
  if (existing) return existing;

  const adapter = createAdapter(serviceId);
  if (!adapter) return null;

  const config = await loadAdapterConfig(serviceId);
  await adapter.initialize(config);
  activeAdapters.set(serviceId, adapter);
  return adapter;
}

export async function removeAdapter(serviceId: string): Promise<void> {
  const adapter = activeAdapters.get(serviceId);
  if (adapter) {
    await adapter.disconnect();
    activeAdapters.delete(serviceId);
  }
}

export async function authenticateAdapter(serviceId: string): Promise<StreamingAdapterConfig> {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);

  const config = await adapter.authenticate();
  await saveAdapterConfig(serviceId, config);
  return config;
}

export async function disconnectAdapter(serviceId: string): Promise<void> {
  await removeAdapter(serviceId);
  await saveAdapterConfig(serviceId, {});
}

export async function adapterSearch(
  serviceId: string,
  query: string,
  types?: ("track" | "album" | "artist" | "playlist")[],
) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.search(query, types);
}

export async function adapterPlay(serviceId: string, uri?: string): Promise<void> {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.play(uri);
}

export async function adapterPause(serviceId: string): Promise<void> {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.pause();
}

export async function adapterNext(serviceId: string): Promise<void> {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.next();
}

export async function adapterPrevious(serviceId: string): Promise<void> {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.previous();
}

export async function adapterCurrentlyPlaying(serviceId: string) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.getCurrentlyPlaying();
}

export async function adapterGetDevices(serviceId: string) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.getDevices();
}

export async function adapterGetTrack(serviceId: string, id: string) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.getTrack(id);
}

export async function adapterGetAlbum(serviceId: string, id: string) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.getAlbum(id);
}

export async function adapterGetPlaylist(serviceId: string, id: string) {
  const adapter = await initializeAdapter(serviceId);
  if (!adapter) throw new Error(`No adapter available for ${serviceId}`);
  return adapter.getPlaylist(id);
}
