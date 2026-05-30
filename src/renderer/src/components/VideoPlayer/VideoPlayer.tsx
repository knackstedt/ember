import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useVideoPlayerStore } from '../../store/videoPlayer.store'
import { useInputStore } from '../../store/input.store'

const INACTIVITY_MS = 3000

function fmt(s: number): string {
  if (!isFinite(s) || isNaN(s) || s < 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function deriveSubtitleUrls(videoSrc: string): string[] {
  const base = videoSrc.replace(/^file:\/\//, '').replace(/\.[^.]+$/, '')
  return [`file://${base}.vtt`, `file://${base}.srt`]
}

export const VideoPlayer: React.FC = () => {
  const { src, title, close } = useVideoPlayerStore()
  const lastEvent = useInputStore((s) => s.lastEvent)

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [subtitleTracks, setSubtitleTracks] = useState<TextTrack[]>([])
  const [activeSubtitle, setActiveSubtitle] = useState<number>(-1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [seeking, setSeeking] = useState(false)

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => {
      if (!seeking) setControlsVisible(false)
    }, INACTIVITY_MS)
  }, [seeking])

  useEffect(() => {
    showControls()
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    }
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onTime = (): void => {
      setCurrentTime(v.currentTime)
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onDuration = (): void => setDuration(isFinite(v.duration) ? v.duration : 0)
    const onTracksChange = (): void => {
      const tracks = Array.from(v.textTracks)
      setSubtitleTracks(tracks)
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDuration)
    v.textTracks.addEventListener('change', onTracksChange)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDuration)
      v.textTracks.removeEventListener('change', onTracksChange)
    }
  }, [src])

  useEffect(() => {
    const onFs = (): void => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    if (!src) return
    const v = videoRef.current
    if (!v) return
    v.src = src
    v.load()
    void v.play()
    setCurrentTime(0)
    setDuration(0)
    setBuffered(0)
    setPlaying(false)
    setActiveSubtitle(-1)
  }, [src])

  useEffect(() => {
    if (!lastEvent || !src) return
    const { type, action } = lastEvent
    if (type !== 'button_press') return
    const v = videoRef.current
    if (!v) return
    showControls()
    if (action === 'south') {
      playing ? v.pause() : void v.play()
    } else if (action === 'east') {
      close()
    } else if (action === 'dpad_left') {
      v.currentTime = Math.max(0, v.currentTime - 10)
    } else if (action === 'dpad_right') {
      v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
    } else if (action === 'dpad_up') {
      const newVol = Math.min(1, v.volume + 0.1)
      v.volume = newVol
      setVolumeState(newVol)
    } else if (action === 'dpad_down') {
      const newVol = Math.max(0, v.volume - 0.1)
      v.volume = newVol
      setVolumeState(newVol)
    }
  }, [lastEvent, src])

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent): void => {
      const v = videoRef.current
      if (!v) return
      showControls()
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        playing ? v.pause() : void v.play()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        v.currentTime = Math.max(0, v.currentTime - 10)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
      } else if (e.code === 'Escape') {
        close()
      } else if (e.code === 'KeyM') {
        v.muted = !v.muted
        setMuted(v.muted)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, playing, close, showControls])

  const togglePlay = (): void => {
    const v = videoRef.current
    if (!v) return
    playing ? v.pause() : void v.play()
  }

  const toggleMute = (): void => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = videoRef.current
    if (!v) return
    const val = parseFloat(e.target.value)
    v.volume = val
    setVolumeState(val)
    if (val > 0 && v.muted) { v.muted = false; setMuted(false) }
  }

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = parseFloat(e.target.value)
    setCurrentTime(v.currentTime)
  }

  const handleSubtitleChange = (idx: number): void => {
    const v = videoRef.current
    if (!v) return
    Array.from(v.textTracks).forEach((t, i) => {
      t.mode = i === idx ? 'showing' : 'hidden'
    })
    setActiveSubtitle(idx)
  }

  const toggleFullscreen = (): void => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }

  const subtitleUrls = src ? deriveSubtitleUrls(src) : []

  if (!src) return null

  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: '#000',
        cursor: controlsVisible ? 'default' : 'none'
      }}
      onMouseMove={showControls}
      onMouseDown={showControls}
    >
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        crossOrigin="anonymous"
        onClick={togglePlay}
      >
        {subtitleUrls.map((url, i) => (
          <track
            key={url}
            kind="subtitles"
            src={url}
            default={i === 0}
          />
        ))}
      </video>

      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            key="controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
              padding: '0 20px 16px'
            }}
            onMouseEnter={() => {
              if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
            }}
            onMouseLeave={showControls}
          >
            {/* Title */}
            <div
              className="text-sm font-medium mb-3 truncate"
              style={{ color: 'rgba(255,255,255,0.9)' }}
            >
              {title}
            </div>

            {/* Seek bar */}
            <div className="relative mb-3" style={{ height: 4 }}>
              {/* Buffered track */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${bufferedPct}%`,
                  background: 'rgba(255,255,255,0.25)',
                  borderRadius: 2,
                  pointerEvents: 'none'
                }}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={currentTime}
                onMouseDown={() => setSeeking(true)}
                onMouseUp={() => { setSeeking(false); showControls() }}
                onChange={handleSeekChange}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  margin: 0,
                  padding: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 2
                }}
                aria-label="Seek"
              />
              {/* Filled track */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${currentPct}%`,
                  background: 'var(--color-accent, #fff)',
                  borderRadius: 2,
                  pointerEvents: 'none'
                }}
              />
              {/* Track bg */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: 2,
                  zIndex: -1
                }}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3">
              {/* Back/close */}
              <button
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-base"
                style={{ color: '#fff', flexShrink: 0 }}
                aria-label="Close player"
                title="Close (Esc)"
              >
                ✕
              </button>

              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="w-9 h-9 flex items-center justify-center rounded-full transition-colors font-bold"
                style={{ background: 'var(--color-accent, rgba(255,255,255,0.9))', color: '#000', flexShrink: 0 }}
                aria-label={playing ? 'Pause' : 'Play'}
                title={playing ? 'Pause (Space)' : 'Play (Space)'}
              >
                {playing ? '⏸' : '▶'}
              </button>

              {/* Time display */}
              <span
                className="text-xs tabular-nums flex-shrink-0"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                {fmt(currentTime)} / {fmt(duration)}
              </span>

              <div className="flex-1" />

              {/* Subtitle selector */}
              {subtitleTracks.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>CC</span>
                  <select
                    value={activeSubtitle}
                    onChange={(e) => handleSubtitleChange(parseInt(e.target.value))}
                    className="text-xs rounded px-1 py-0.5"
                    style={{
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.3)',
                      maxWidth: 100
                    }}
                    aria-label="Subtitle track"
                  >
                    <option value={-1}>Off</option>
                    {subtitleTracks.map((t, i) => (
                      <option key={i} value={i}>
                        {t.label || t.language || `Track ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Volume */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={toggleMute}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-sm"
                  style={{ color: '#fff' }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  title="Mute (M)"
                >
                  {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 cursor-pointer"
                  style={{ accentColor: 'var(--color-accent, #fff)' }}
                  aria-label="Volume"
                />
              </div>

              {/* Fullscreen toggle */}
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/20 transition-colors text-base"
                style={{ color: '#fff', flexShrink: 0 }}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? '⛶' : '⛶'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
