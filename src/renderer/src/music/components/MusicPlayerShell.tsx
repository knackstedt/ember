import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useMusicPlayerStore, audio as musicAudio } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import type { PlayerView } from "../types";
import { MusicPlayerBar } from "./MusicPlayerBar";
import { MusicPlayerOverlay } from "./MusicPlayerOverlay";
import { MusicPlayerFullscreen } from "./MusicPlayerFullscreen";

export const MusicPlayerShell: React.FC = React.memo(() => {
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [playerView, setPlayerView] = useState<PlayerView>("mini");

  // Sync player view with global focus zone
  useEffect(() => {
    const unsub = useFocusZoneStore.subscribe((state) => {
      if (state.activeZone === "tab" && playerView !== "mini") {
        setPlayerView("mini");
      } else if (state.activeZone === "player" && playerView === "mini") {
        setPlayerView("overlay");
      }
    });
    return unsub;
  }, [playerView]);

  const expandOverlay = useCallback(() => {
    if (hasPlayer) {
      setPlayerView("overlay");
      setZone("player");
    }
  }, [hasPlayer, setZone]);

  const closeOverlay = useCallback(() => {
    setPlayerView("mini");
    setZone("tab");
  }, [setZone]);

  const goFullscreen = useCallback(() => {
    setPlayerView("fullscreen");
    setZone("player");
  }, [setZone]);

  const exitFullscreen = useCallback(() => {
    setPlayerView("overlay");
    setZone("player");
  }, [setZone]);

  if (!hasPlayer) return null;

  return (
    <>
      <AnimatePresence>
        {playerView === "mini" && <MusicPlayerBar onExpand={expandOverlay} />}
      </AnimatePresence>

      <AnimatePresence>
        {playerView === "overlay" && (
          <MusicPlayerOverlay onClose={closeOverlay} onFullscreen={goFullscreen} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerView === "fullscreen" && (
          <MusicPlayerFullscreen audioElement={musicAudio} onExit={exitFullscreen} />
        )}
      </AnimatePresence>
    </>
  );
});
