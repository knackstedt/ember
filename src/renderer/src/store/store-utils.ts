export function upsertById<T extends { id: string }>(
  existing: T[],
  incoming: T,
): T[] {
  const idx = existing.findIndex((item) => item.id === incoming.id);
  if (idx === -1) return [...existing, incoming];
  const next = [...existing];
  next[idx] = incoming;
  return next;
}

export function shallowEqualWithJsonKeys<T extends Record<string, any>>(
  a: T,
  b: T,
  jsonKeys: ReadonlySet<keyof T>,
): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  for (const key of keys) {
    if (jsonKeys.has(key)) {
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  jsonKeys: ReadonlySet<keyof T>,
): T[] {
  if (existing.length === 0) return incoming;
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  const nextItems: T[] = [];
  let changed = false;
  for (const incomingItem of incoming) {
    const existingItem = existingMap.get(incomingItem.id);
    if (!existingItem) {
      nextItems.push(incomingItem);
      changed = true;
    } else if (!shallowEqualWithJsonKeys(existingItem, incomingItem, jsonKeys)) {
      nextItems.push(incomingItem);
      changed = true;
    } else {
      nextItems.push(existingItem);
    }
  }
  if (!changed && nextItems.length === existing.length) return existing;
  return nextItems;
}
