import { ipcMain } from "electron";
import { CollectionRepo, PlaylistRepo } from "../../db/repository";
import type { Collection, CollectionItem, Playlist, SmartFilterGroup } from "../../../shared/types";
import type { IpcContext } from "../types";

export function registerCollectionsHandlers(_ctx: IpcContext): void {
  // Collections
  ipcMain.handle("collections:list", async () => CollectionRepo.list());
  ipcMain.handle("collections:get", async (_e, id: string) => CollectionRepo.get(id));
  ipcMain.handle("collections:create", async (_e, collection: Collection) => CollectionRepo.create(collection));
  ipcMain.handle("collections:update", async (_e, collection: Collection) => CollectionRepo.update(collection));
  ipcMain.handle("collections:delete", async (_e, id: string) => CollectionRepo.delete(id));
  ipcMain.handle("collections:items:list", async (_e, collectionId: string) => CollectionRepo.listItems(collectionId));
  ipcMain.handle("collections:items:add", async (_e, item: CollectionItem) => CollectionRepo.addItem(item));
  ipcMain.handle("collections:items:remove", async (_e, collectionId: string, itemId: string) => CollectionRepo.removeItem(collectionId, itemId));
  ipcMain.handle("collections:smart:evaluate", async (_e, itemType: string, filter: SmartFilterGroup) => CollectionRepo.evaluateSmartFilter(itemType, filter));

  // Playlists
  ipcMain.handle("playlist:list", async () => PlaylistRepo.list());
  ipcMain.handle("playlist:create", async (_e, playlist: Playlist) => {
    await PlaylistRepo.create(playlist);
    return playlist;
  });
  ipcMain.handle("playlist:update", async (_e, id: string, data: Partial<Playlist>) => {
    const existing = await PlaylistRepo.get(id);
    if (!existing) throw new Error(`Playlist not found: ${id}`);
    const updated = { ...existing, ...data, updatedAt: Date.now() };
    await PlaylistRepo.update(updated);
    return updated;
  });
  ipcMain.handle("playlist:delete", async (_e, id: string) => PlaylistRepo.delete(id));
  ipcMain.handle("playlist:addTracks", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.addTracks(id, trackIds);
    return PlaylistRepo.get(id);
  });
  ipcMain.handle("playlist:removeTracks", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.removeTracks(id, trackIds);
    return PlaylistRepo.get(id);
  });
  ipcMain.handle("playlist:reorder", async (_e, id: string, trackIds: string[]) => {
    await PlaylistRepo.reorder(id, trackIds);
    return PlaylistRepo.get(id);
  });
}
