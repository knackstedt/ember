import { SourceLocation } from "../../../shared/types";

export interface SourceBadge {
  badge?: string;
  badgeColor?: string;
}

const RCLONE_COLORS: Record<string, string> = {
  sftp: "#4ade80",
  ftp: "#60a5fa",
  smb: "#f472b6",
  webdav: "#a78bfa",
  http: "#fb923c",
  googledrive: "#facc15",
  dropbox: "#38bdf8",
  onedrive: "#818cf8",
};

export function getSourceBadge(sourceLocation?: SourceLocation): SourceBadge {
  if (!sourceLocation) return {};

  if (sourceLocation === "local") {
    return { badge: "Local", badgeColor: "#4ade80" };
  }

  if (sourceLocation === "remote") {
    return { badge: "Remote", badgeColor: "#94a3b8" };
  }

  if (sourceLocation === "online") {
    return { badge: "Online", badgeColor: "#38bdf8" };
  }

  if (sourceLocation.startsWith("rclone:")) {
    const protocol = sourceLocation.slice("rclone:".length);
    const label = protocol.toUpperCase();
    const color = RCLONE_COLORS[protocol] ?? "#94a3b8";
    return { badge: label, badgeColor: color };
  }

  return {};
}
