import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  X,
  Plus,
  Home,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Store,
  LogIn,
  LogOut,
  Download,
  Library,
  AlertCircle,
  CheckCircle,
  Loader,
  Gamepad2,
} from "lucide-react";
import { scaledImageUrl } from "../../lib/image-url";
import { useToastStore } from "../../store/toast.store";

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

const DEFAULT_URL = "https://itch.io";

const STORE_PROVIDERS = [
  { id: "itch", name: "itch.io", url: "https://itch.io", color: "#fa5c5c" },
  { id: "gog", name: "GOG", url: "https://gog.com", color: "#86328a" },
  { id: "steam", name: "Steam", url: "https://store.steampowered.com", color: "#1b2838" },
];

export const StoreTab: React.FC = () => {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: "tab-0", url: DEFAULT_URL, title: "itch.io" },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-0");
  const [addressInput, setAddressInput] = useState(DEFAULT_URL);
  const [showProviders, setShowProviders] = useState(false);
  const [itchAuth, setItchAuth] = useState<{ authenticated: boolean; username?: string } | null>(null);
  const [itchLoading, setItchLoading] = useState(false);
  const [libraryGames, setLibraryGames] = useState<any[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const webviewRefs = useRef<Record<string, Electron.WebviewTag | null>>({});
  const addToast = useToastStore((s) => s.push);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  /* ------------------------------------------------------------------ */
  /*  Itch auth & library                                               */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    refreshItchStatus();
  }, []);

  const refreshItchStatus = async () => {
    try {
      const status = await window.htpc.store.itch.status();
      setItchAuth(status);
      if (status.authenticated) {
        refreshLibrary();
      }
    } catch {
      setItchAuth({ authenticated: false });
    }
  };

  const refreshLibrary = async () => {
    try {
      const games = await window.htpc.store.itch.library();
      setLibraryGames(games);
    } catch {
      // ignore
    }
  };

  const handleItchLogin = async () => {
    setItchLoading(true);
    try {
      const result = await window.htpc.store.itch.login();
      if (result.success) {
        addToast({ type: "success", message: "Logged in to itch.io" });
        await refreshItchStatus();
      } else {
        addToast({ type: "error", message: result.error ?? "itch.io login failed" });
      }
    } catch (err: any) {
      addToast({ type: "error", message: err.message ?? "itch.io login failed" });
    } finally {
      setItchLoading(false);
    }
  };

  const handleItchLogout = async () => {
    setItchLoading(true);
    try {
      const result = await window.htpc.store.itch.logout();
      if (result.success) {
        addToast({ type: "success", message: "Logged out from itch.io" });
        setItchAuth({ authenticated: false });
        setLibraryGames([]);
      } else {
        addToast({ type: "error", message: result.error ?? "Logout failed" });
      }
    } catch (err: any) {
      addToast({ type: "error", message: err.message ?? "Logout failed" });
    } finally {
      setItchLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Tab management                                                      */
  /* ------------------------------------------------------------------ */

  const addTab = useCallback((url: string = DEFAULT_URL) => {
    const id = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id, url, title: "New Tab" }]);
    setActiveTabId(id);
    setAddressInput(url);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) {
          // Don't close the last tab; reset it instead
          const reset = [{ id: "tab-0", url: DEFAULT_URL, title: "itch.io" }];
          setActiveTabId("tab-0");
          setAddressInput(DEFAULT_URL);
          return reset;
        }
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          const idx = prev.findIndex((t) => t.id === id);
          const newActive = prev[idx - 1] ?? prev[idx + 1] ?? next[0];
          setActiveTabId(newActive.id);
          setAddressInput(newActive.url);
        }
        return next;
      });
      delete webviewRefs.current[id];
    },
    [activeTabId]
  );

  const updateTab = useCallback(
    (id: string, patch: Partial<BrowserTab>) => {
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    []
  );

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                          */
  /* ------------------------------------------------------------------ */

  const navigateTo = useCallback(
    (url: string) => {
      let normalized = url.trim();
      if (!normalized) return;
      if (!/^https?:\/\//i.test(normalized) && !/^file:\/\//i.test(normalized)) {
        // Try search or add https://
        if (normalized.includes(".") && !normalized.includes(" ")) {
          normalized = `https://${normalized}`;
        } else {
          normalized = `https://duckduckgo.com/?q=${encodeURIComponent(normalized)}`;
        }
      }
      setAddressInput(normalized);
      const wv = webviewRefs.current[activeTabId];
      if (wv) {
        wv.src = normalized;
      } else {
        updateTab(activeTabId, { url: normalized });
      }
    },
    [activeTabId, updateTab]
  );

  const goBack = useCallback(() => {
    const wv = webviewRefs.current[activeTabId];
    if (wv && wv.canGoBack()) wv.goBack();
  }, [activeTabId]);

  const goForward = useCallback(() => {
    const wv = webviewRefs.current[activeTabId];
    if (wv && wv.canGoForward()) wv.goForward();
  }, [activeTabId]);

  const reload = useCallback(() => {
    const wv = webviewRefs.current[activeTabId];
    if (wv) wv.reload();
  }, [activeTabId]);

  const goHome = useCallback(() => {
    navigateTo(DEFAULT_URL);
  }, [navigateTo]);

  /* ------------------------------------------------------------------ */
  /*  Webview events                                                      */
  /* ------------------------------------------------------------------ */

  const webviewCleanups = useRef<Record<string, (() => void)>>({});

  const attachWebview = useCallback(
    (id: string, el: Electron.WebviewTag | null) => {
      if (!el) return;

      // Clean up previous listeners for this tab if any
      webviewCleanups.current[id]?.();

      webviewRefs.current[id] = el;

      const handleLoadStart = () => {
        updateTab(id, { isLoading: true });
      };

      const handleLoadStop = () => {
        updateTab(id, { isLoading: false, canGoBack: el.canGoBack(), canGoForward: el.canGoForward() });
        try {
          setAddressInput(el.getURL());
        } catch {
          // ignore cross-origin restrictions
        }
      };

      const handlePageTitle = () => {
        try {
          updateTab(id, { title: el.getTitle() });
        } catch {
          // ignore
        }
      };

      const handleFavicon = (e: any) => {
        updateTab(id, { favicon: e.favicons?.[0] });
      };

      const handleNewWindow = (e: any) => {
        e.preventDefault();
        addTab(e.url);
      };

      el.addEventListener("did-start-loading", handleLoadStart);
      el.addEventListener("did-stop-loading", handleLoadStop);
      el.addEventListener("page-title-updated", handlePageTitle);
      el.addEventListener("page-favicon-updated", handleFavicon);
      el.addEventListener("new-window", handleNewWindow as any);

      // Store cleanup so we can call it on tab close, not on React ref re-run
      webviewCleanups.current[id] = () => {
        el.removeEventListener("did-start-loading", handleLoadStart);
        el.removeEventListener("did-stop-loading", handleLoadStop);
        el.removeEventListener("page-title-updated", handlePageTitle);
        el.removeEventListener("page-favicon-updated", handleFavicon);
        el.removeEventListener("new-window", handleNewWindow as any);
      };
    },
    [addTab, updateTab, activeTabId]
  );

  /* ------------------------------------------------------------------ */
  /*  Install from itch web                                               */
  /* ------------------------------------------------------------------ */

  const handleInstallFromUrl = useCallback(
    async (gameUrl: string) => {
      // Parse itch.io game page URL to extract game identifier
      const match = gameUrl.match(/itch\.io\/([^/]+)\/([^/]+)/);
      if (!match) {
        addToast({ type: "error", message: "Not a recognized itch.io game URL" });
        return;
      }
      const [, _author, gameSlug] = match;
      setItchLoading(true);
      try {
        // Try to install via butler using the URL slug
        const result = await window.htpc.store.itch.install(gameSlug, gameSlug);
        if (result.success) {
          addToast({ type: "success", message: `Installed ${gameSlug}` });
          await refreshLibrary();
          // Trigger a game scan so the new game appears in Gaming tab
          await window.htpc.games.scan();
        } else {
          addToast({ type: "error", message: result.error ?? "Install failed" });
        }
      } catch (err: any) {
        addToast({ type: "error", message: err.message ?? "Install failed" });
      } finally {
        setItchLoading(false);
      }
    },
    [addToast]
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                              */
  /* ------------------------------------------------------------------ */

  return (
    <div className="flex flex-col h-full w-full bg-black/40 backdrop-blur-sm">
      {/* Top bar: itch auth + providers */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-2 mr-4">
          <Store size={18} className="text-white/70" />
          <span className="text-sm font-medium text-white/80">Store</span>
        </div>

        {/* Provider selector */}
        <div className="relative">
          <button
            onClick={() => setShowProviders((s) => !s)}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-xs text-white/80 transition"
          >
            <Globe size={14} />
            {STORE_PROVIDERS.find((p) => p.url === activeTab?.url)?.name ?? "Stores"}
          </button>
          <AnimatePresence>
            {showProviders && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg bg-[#1a1a1a] border border-white/10 shadow-xl overflow-hidden"
              >
                {STORE_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      navigateTo(p.url);
                      setShowProviders(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1" />

        {/* itch auth */}
        <div className="flex items-center gap-2">
          {itchAuth?.authenticated ? (
            <>
              <span className="text-xs text-white/50">
                itch.io: {itchAuth.username}
              </span>
              <button
                onClick={handleItchLogout}
                disabled={itchLoading}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-xs text-white/70 transition disabled:opacity-50"
              >
                <LogOut size={12} />
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={handleItchLogin}
              disabled={itchLoading}
              className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-xs text-white/70 transition disabled:opacity-50"
            >
              <LogIn size={12} />
              itch.io Login
            </button>
          )}
          <button
            onClick={() => setShowLibrary((s) => !s)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/15 text-xs text-white/70 transition"
          >
            <Library size={12} />
            Library
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 pt-2 bg-black/20 border-b border-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTabId(tab.id);
              setAddressInput(tab.url);
            }}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-t text-xs transition min-w-[120px] max-w-[200px] ${
              tab.id === activeTabId
                ? "bg-white/10 text-white"
                : "bg-transparent text-white/50 hover:bg-white/5"
            }`}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-3 h-3" />
            ) : (
              <Globe size={12} />
            )}
            <span className="truncate flex-1 text-left">{tab.title}</span>
            {tab.isLoading && <Loader size={10} className="animate-spin" />}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-white transition"
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button
          onClick={() => addTab()}
          className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/20 border-b border-white/5">
        <button onClick={goBack} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition disabled:opacity-30" disabled={!activeTab?.canGoBack}>
          <ArrowLeft size={14} />
        </button>
        <button onClick={goForward} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition disabled:opacity-30" disabled={!activeTab?.canGoForward}>
          <ArrowRight size={14} />
        </button>
        <button onClick={reload} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition">
          <RefreshCw size={14} />
        </button>
        <button onClick={goHome} className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition">
          <Home size={14} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigateTo(addressInput);
          }}
          className="flex-1"
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            className="w-full px-3 py-1 rounded bg-white/5 border border-white/10 text-sm text-white/80 focus:outline-none focus:border-white/30 transition"
            placeholder="Enter URL or search..."
          />
        </form>
        {addressInput.includes("itch.io") && itchAuth?.authenticated && (
          <button
            onClick={() => handleInstallFromUrl(addressInput)}
            disabled={itchLoading}
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-xs transition disabled:opacity-50"
          >
            <Download size={12} />
            Install
          </button>
        )}
      </div>

      {/* Main content: webviews + library sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Webviews */}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 ${tab.id === activeTabId ? "visible" : "invisible"}`}
          >
            <webview
              ref={(el) => attachWebview(tab.id, el as any)}
              src={tab.url}
              className="w-full h-full"
              allowpopups="false"
              nodeintegration="false"
              webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
            />
          </div>
        ))}

        {/* Library sidebar overlay */}
        <AnimatePresence>
          {showLibrary && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-[#111] border-l border-white/10 flex flex-col z-20"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-sm font-medium text-white/80">itch.io Library</span>
                <button onClick={() => setShowLibrary(false)} className="text-white/40 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {libraryGames.length === 0 && (
                  <div className="text-center py-8 text-white/30 text-sm">
                    <Library size={32} className="mx-auto mb-2 opacity-50" />
                    {itchAuth?.authenticated
                      ? "No installed games found."
                      : "Login to itch.io to see your library."}
                  </div>
                )}
                {libraryGames.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-white/5 transition cursor-pointer group"
                    onClick={() => {
                      if (g.execPath) {
                        window.htpc.store.itch.launch({
                          id: g.id,
                          title: g.title,
                          platform: "itch",
                          execPath: g.execPath,
                        }).then((res) => {
                          if (!res.success) addToast({ type: "error", message: res.error ?? "Launch failed" });
                        });
                      }
                    }}
                  >
                    {g.coverUrl ? (
                      <img src={scaledImageUrl(g.coverUrl, 40, 40)} alt="" className="w-10 h-10 rounded object-cover bg-white/5" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center">
                        <Gamepad2 size={16} className="text-white/30" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/80 truncate">{g.title}</div>
                      <div className="text-xs text-white/40 truncate">{g.developer}</div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition">
                      {g.installed ? (
                        <CheckCircle size={14} className="text-emerald-400" />
                      ) : (
                        <Download size={14} className="text-white/40" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
