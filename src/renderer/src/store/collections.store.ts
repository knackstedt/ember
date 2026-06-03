import { create } from "zustand";
import {
  Collection,
  CollectionItem,
  CollectionItemType,
  SmartFilterGroup,
  SmartFilterRule,
  AiGroup,
} from "../../../shared/types";

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  load: () => Promise<void>;
  createCollection: (collection: Omit<Collection, "id" | "createdAt" | "updatedAt">) => Promise<Collection>;
  updateCollection: (collection: Collection) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  addItem: (collectionId: string, itemId: string, itemType: CollectionItemType) => Promise<void>;
  removeItem: (collectionId: string, itemId: string) => Promise<void>;
  listItems: (collectionId: string) => Promise<CollectionItem[]>;
  evaluateSmartFilter: (itemType: CollectionItemType, filter: SmartFilterGroup) => Promise<string[]>;
  getCollectionsForType: (itemType: CollectionItemType) => Collection[];
  isAiAvailable: () => Promise<boolean>;
  nlToFilter: (query: string, itemType: CollectionItemType) => Promise<SmartFilterGroup | null>;
  groupItems: (
    items: Array<{
      id: string;
      title: string;
      genres?: string[];
      tags?: string[];
      description?: string;
      platform?: string;
      artist?: string;
      album?: string;
      genre?: string;
    }>,
    groupCount: number,
  ) => Promise<AiGroup[]>;
}

export function sortByCollection<T extends object>(
  items: T[],
  collection: Collection | undefined,
): T[] {
  if (!collection?.sortOrder || collection.sortOrder === "added") return items;
  const dir = collection.sortDirection === "desc" ? -1 : 1;
  const key = collection.sortOrder as keyof T;
  return [...items].sort((a, b) => {
    const av = a[key] as unknown;
    const bv = b[key] as unknown;
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return 1 * dir;
    if (bv === undefined) return -1 * dir;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const collections = await window.htpc.collections.list();
      set({ collections, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createCollection: async (data) => {
    const now = Date.now();
    const collection: Collection = {
      ...data,
      id: `coll_${now}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    };
    await window.htpc.collections.create(collection);
    set((s) => ({ collections: [...s.collections, collection] }));
    return collection;
  },

  updateCollection: async (collection) => {
    const updated = { ...collection, updatedAt: Date.now() };
    await window.htpc.collections.update(updated);
    set((s) => ({
      collections: s.collections.map((c) => (c.id === updated.id ? updated : c)),
    }));
  },

  deleteCollection: async (id) => {
    await window.htpc.collections.delete(id);
    set((s) => ({
      collections: s.collections.filter((c) => c.id !== id),
    }));
  },

  addItem: async (collectionId, itemId, itemType) => {
    const item: CollectionItem = {
      id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      collectionId,
      itemId,
      itemType,
      addedAt: Date.now(),
    };
    await window.htpc.collections.items.add(item);
  },

  removeItem: async (collectionId, itemId) => {
    await window.htpc.collections.items.remove(collectionId, itemId);
  },

  listItems: async (collectionId) => {
    return window.htpc.collections.items.list(collectionId);
  },

  evaluateSmartFilter: async (itemType, filter) => {
    return window.htpc.collections.smartEvaluate(itemType, filter);
  },

  getCollectionsForType: (itemType) => {
    return get().collections.filter(
      (c) => c.itemType === itemType || c.itemType === "mixed",
    );
  },

  isAiAvailable: async () => {
    return window.htpc.localAi.available();
  },

  nlToFilter: async (query, itemType) => {
    return window.htpc.localAi.nlToFilter(query, itemType);
  },

  groupItems: async (items, groupCount) => {
    return window.htpc.localAi.groupItems(items, groupCount);
  },
}));

/* ------------------------------------------------------------------ */
/*  Smart-filter engine (runs in renderer against loaded data)        */
/* ------------------------------------------------------------------ */

export function evaluateSmartFilter<T extends object>(
  items: T[],
  filter: SmartFilterGroup,
): T[] {
  return items.filter((item) => evaluateGroup(item, filter));
}

function evaluateGroup<T extends object>(
  item: T,
  group: SmartFilterGroup,
): boolean {
  const results = group.rules.map((rule) => {
    if ("logic" in rule) {
      return evaluateGroup(item, rule as SmartFilterGroup);
    }
    return evaluateRule(item, rule as SmartFilterRule);
  });
  return group.logic === "and"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function evaluateRule<T extends object>(
  item: T,
  rule: SmartFilterRule,
): boolean {
  const raw = (item as Record<string, unknown>)[rule.field];
  const value = rule.value;

  switch (rule.operator) {
    case "eq":
      return raw === value;
    case "ne":
      return raw !== value;
    case "gt":
      return typeof raw === "number" && typeof value === "number" && raw > value;
    case "gte":
      return typeof raw === "number" && typeof value === "number" && raw >= value;
    case "lt":
      return typeof raw === "number" && typeof value === "number" && raw < value;
    case "lte":
      return typeof raw === "number" && typeof value === "number" && raw <= value;
    case "contains": {
      if (typeof raw === "string" && typeof value === "string") {
        return raw.toLowerCase().includes(value.toLowerCase());
      }
      if (Array.isArray(raw)) {
        return raw.some((v) => {
          if (typeof v === "string" && typeof value === "string") {
            return v.toLowerCase().includes(value.toLowerCase());
          }
          return v === value;
        });
      }
      return false;
    }
    case "in": {
      if (Array.isArray(value)) {
        return value.includes(raw);
      }
      return false;
    }
    case "startsWith":
      return typeof raw === "string" && typeof value === "string" && raw.toLowerCase().startsWith(value.toLowerCase());
    case "endsWith":
      return typeof raw === "string" && typeof value === "string" && raw.toLowerCase().endsWith(value.toLowerCase());
    case "exists":
      return raw !== undefined && raw !== null && raw !== "";
    default:
      return false;
  }
}
