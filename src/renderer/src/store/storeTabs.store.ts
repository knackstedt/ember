import { create } from "zustand";

const STORAGE_KEY = "ember:store-tabs";
const BOOKMARKS_KEY = "ember:store-bookmarks";

export interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  pinned?: boolean;
}

export interface StoreBookmark {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  addedAt: number;
}

interface StoreTabsState {
  tabs: BrowserTabState[];
  activeTabId: string | null;
  bookmarks: StoreBookmark[];

  /* actions */
  loadPersisted: () => void;
  addTab: (url?: string, title?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<BrowserTabState>) => void;
  togglePin: (id: string) => void;
  setTabs: (tabs: BrowserTabState[]) => void;

  /* bookmarks */
  addBookmark: (url: string, title: string, favicon?: string) => void;
  removeBookmark: (id: string) => void;
  loadBookmarks: () => void;
}

function loadFromStorage(): { tabs: BrowserTabState[]; activeTabId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        return { tabs: data.tabs, activeTabId: data.activeTabId ?? data.tabs[0]?.id ?? null };
      }
    }
  } catch {
    // ignore
  }
  const defaultTab = { id: "tab-0", url: "https://itch.io", title: "itch.io" };
  return { tabs: [defaultTab], activeTabId: "tab-0" };
}

function saveToStorage(tabs: BrowserTabState[], activeTabId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {
    // ignore
  }
}

function loadBookmarksFromStorage(): StoreBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveBookmarksToStorage(bookmarks: StoreBookmark[]) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch {
    // ignore
  }
}

export const useStoreTabs = create<StoreTabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  bookmarks: [],

  loadPersisted: () => {
    const { tabs, activeTabId } = loadFromStorage();
    set({ tabs, activeTabId });
    get().loadBookmarks();
  },

  addTab: (url = "https://itch.io", title = "New Tab") => {
    const id = `tab-${Date.now()}`;
    set((s) => {
      const next = [...s.tabs, { id, url, title }];
      saveToStorage(next, id);
      return { tabs: next, activeTabId: id };
    });
    return id;
  },

  closeTab: (id) => {
    set((s) => {
      if (s.tabs.length <= 1) {
        const reset = [{ id: "tab-0", url: "https://itch.io", title: "itch.io" }];
        saveToStorage(reset, "tab-0");
        return { tabs: reset, activeTabId: "tab-0" };
      }
      const next = s.tabs.filter((t) => t.id !== id);
      let nextActive = s.activeTabId;
      if (s.activeTabId === id) {
        const idx = s.tabs.findIndex((t) => t.id === id);
        const fallback = s.tabs[idx - 1] ?? s.tabs[idx + 1] ?? next[0];
        nextActive = fallback.id;
      }
      saveToStorage(next, nextActive);
      return { tabs: next, activeTabId: nextActive };
    });
  },

  setActiveTab: (id) => {
    set((s) => {
      saveToStorage(s.tabs, id);
      return { activeTabId: id };
    });
  },

  updateTab: (id, patch) => {
    set((s) => {
      const next = s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t));
      saveToStorage(next, s.activeTabId);
      return { tabs: next };
    });
  },

  togglePin: (id) => {
    set((s) => {
      const next = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t));
      // Re-sort: pinned first
      next.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });
      saveToStorage(next, s.activeTabId);
      return { tabs: next };
    });
  },

  setTabs: (tabs) => {
    set({ tabs });
    saveToStorage(tabs, get().activeTabId);
  },

  /* bookmarks */
  addBookmark: (url, title, favicon) => {
    set((s) => {
      const exists = s.bookmarks.some((b) => b.url === url);
      if (exists) return s;
      const next = [...s.bookmarks, { id: `bm-${Date.now()}`, url, title, favicon, addedAt: Date.now() }];
      saveBookmarksToStorage(next);
      return { bookmarks: next };
    });
  },

  removeBookmark: (id) => {
    set((s) => {
      const next = s.bookmarks.filter((b) => b.id !== id);
      saveBookmarksToStorage(next);
      return { bookmarks: next };
    });
  },

  loadBookmarks: () => {
    set({ bookmarks: loadBookmarksFromStorage() });
  },
}));
