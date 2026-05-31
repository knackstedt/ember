import { homedir } from "os";
import { join } from "path";

export function getXdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
}

export function getXdgDataDirs(): string[] {
  const systemDirs = (
    process.env.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share"
  ).split(":");
  return [getXdgDataHome(), ...systemDirs];
}

export function getXdgMusicDir(): string {
  return process.env.XDG_MUSIC_DIR ?? join(homedir(), "Music");
}

export function getXdgVideosDir(): string {
  return process.env.XDG_VIDEOS_DIR ?? join(homedir(), "Videos");
}

export function getXdgDesktopDirs(): string[] {
  return getXdgDataDirs().map((d) => join(d, "applications"));
}
