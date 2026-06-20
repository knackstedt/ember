import { MusicTrack } from "../../../../shared/types";

export function getTrackDisplayName(track: MusicTrack): string {
  const trimmed = track.title?.trim();
  if (trimmed) return trimmed;
  const parts = track.filePath.split(/[\\/]/);
  const name = parts.pop() || track.filePath;
  return name.replace(/\.[^.]+$/, "");
}
