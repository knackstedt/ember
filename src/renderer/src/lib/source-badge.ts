import { SourceLocation } from "../../../shared/types";

export interface SourceBadge {
  badge?: string;
  badgeColor?: string;
}

const RCLONE_COLORS: Record<string, string> = {
  sftp: "var(--badge-sftp)",
  ftp: "var(--badge-ftp)",
  smb: "var(--badge-smb)",
  webdav: "var(--badge-webdav)",
  http: "var(--badge-http)",
  googledrive: "var(--badge-googledrive)",
  dropbox: "var(--badge-dropbox)",
  onedrive: "var(--badge-onedrive)",
};

export function getSourceBadge(sourceLocation?: SourceLocation): SourceBadge {
  if (!sourceLocation) return {};

  if (sourceLocation === "local") {
    return { badge: "Local", badgeColor: "var(--badge-local)" };
  }

  if (sourceLocation === "remote") {
    return { badge: "Remote", badgeColor: "var(--badge-remote)" };
  }

  if (sourceLocation === "online") {
    return { badge: "Online", badgeColor: "var(--badge-online)" };
  }

  if (sourceLocation.startsWith("rclone:")) {
    const protocol = sourceLocation.slice("rclone:".length);
    const label = protocol.toUpperCase();
    const color = RCLONE_COLORS[protocol] ?? "var(--badge-fallback)";
    return { badge: label, badgeColor: color };
  }

  return {};
}
