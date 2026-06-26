import { readFileSync } from "fs";

export function getDescendantPids(pid: number): number[] {
  const descendants: number[] = [];
  try {
    const childStr = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf-8").trim();
    if (childStr) {
      const childPids = childStr
        .split(/\s+/)
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0);
      for (const child of childPids) {
        descendants.push(child, ...getDescendantPids(child));
      }
    }
  } catch {
    // ignore unreadable /proc entries (kernel threads, exited processes, etc.)
  }
  return descendants;
}

export function getSiblingPids(pid: number): number[] {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf-8");
    const ppidMatch = status.match(/PPid:\s*(\d+)/);
    if (!ppidMatch) return [];
    const ppid = Number(ppidMatch[1]);
    if (ppid <= 1) return [];
    const childStr = readFileSync(`/proc/${ppid}/task/${ppid}/children`, "utf-8").trim();
    if (!childStr) return [];
    return childStr
      .split(/\s+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n > 0 && n !== pid);
  } catch {
    return [];
  }
}
