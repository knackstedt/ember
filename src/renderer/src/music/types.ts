export type MusicNavItem =
  | "all"
  | "genre"
  | "artists"
  | "albums"
  | "folders"
  | "playlists";

export type MusicViewMode = "grid" | "list";

export type MusicSortOption =
  | "title"
  | "artist"
  | "album"
  | "year"
  | "date-added"
  | "rating";

/** Internal focus zones within the MusicTab when the global zone is 'tab' */
export type MusicFocusZone = "nav" | "toolbar" | "content";

/** Player display states */
export type PlayerView = "mini" | "overlay" | "fullscreen";

export interface MusicFolderItem {
  name: string;
  path: string;
  trackCount: number;
  coverUrl?: string;
}
