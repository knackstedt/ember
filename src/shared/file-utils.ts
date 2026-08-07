import { readdirSync, statSync } from "fs";
import { join } from "path";

/** Recursively search a directory for a file by exact name. */
export function findFileRecursive(dir: string, targetName: string): string | null {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          const found = findFileRecursive(full, targetName);
          if (found) return found;
        } else if (entry === targetName) {
          return full;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore unreadable dirs
  }
  return null;
}
