import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useMusicPlayerStore, audio as musicAudio } from "../../store/musicPlayer.store";
import { useFocusZoneStore } from "../../store/focusZone.store";
import type { PlayerView } from "../types";
import { MusicPlayerBar } from "./MusicPlayerBar";
import { MusicPlayerFull } from "./MusicPlayerFull";

export const MusicPlayerShell: React.FC = React.memo(() => {
  const hasPlayer = useMusicPlayerStore((s) => s.queue.length > 0);
  const currentTrack = useMusicPlayerStore((s) => s.queue[s.currentIndex]);
  const loadCover = useMusicPlayerStore((s) => s.loadCover);
  const setZone = useFocusZoneStore((s) => s.setZone);

  const [playerView, setPlayerView] = useState<PlayerView>("mini");

  useEffect(() => {
    if (!currentTrack || currentTrack.albumArtUrl) return;
    void loadCover(currentTrack);
  }, [currentTrack?.id, currentTrack?.albumArtUrl, loadCover]);

  // Sync player view with global focus zone
  useEffect(() => {
    const unsub = useFocusZoneStore.subscribe((state) => {
      if (state.activeZone === "tab" && playerView !== "mini") {
        setPlayerView("mini");
      } else if (state.activeZone === "player" && playerView === "mini") {
        setPlayerView("full");
      }
    });
    return unsub;
  }, [playerView]);

  const expandFull = useCallback(() => {
    if (hasPlayer) {
      setPlayerView("full");
      setZone("player");
    }
  }, [hasPlayer, setZone]);

  const closeFull = useCallback(() => {
    setPlayerView("mini");
    setZone("tab");
  }, [setZone]);

  if (!hasPlayer) return null;

  return (
    <>
      <AnimatePresence>
        {playerView === "mini" && <MusicPlayerBar onExpand={expandFull} />}
      </AnimatePresence>

      <AnimatePresence>
        {playerView === "full" && (
          <MusicPlayerFull audioElement={musicAudio} onClose={closeFull} />
        )}
      </AnimatePresence>
    </>
  );
});
