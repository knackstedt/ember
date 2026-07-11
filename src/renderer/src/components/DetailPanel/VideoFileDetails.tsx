import React, { useEffect, useState } from "react";
import { Movie, AudioTrackInfo, SubtitleTrackInfo, ChapterInfo } from "../../../../shared/types";
import { scaledImageUrl } from "../../lib/image-url";

interface VideoFileDetailsProps {
  movie: Movie;
  onPlayChapter?: (progressFraction: number) => void;
}

function fmtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MetaRow({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      {badge ? (
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded"
          style={{
            background: "color-mix(in srgb, var(--accent) 18%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
            color: "var(--text-primary)",
          }}
        >
          {value}
        </span>
      ) : (
        <span className="text-xs" style={{ color: "var(--text-primary)" }}>
          {value}
        </span>
      )}
    </div>
  );
}

function TrackList({
  title,
  tracks,
  render,
}: {
  title: string;
  tracks: any[];
  render: (track: any, index: number) => React.ReactNode;
}) {
  if (!tracks || tracks.length === 0) return null;
  return (
    <div className="mb-3">
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {title} ({tracks.length})
      </div>
      <div className="space-y-0.5">
        {tracks.map((t, i) => (
          <div key={i} className="text-xs" style={{ color: "var(--text-primary)" }}>
            {render(t, i)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChapterItem({
  chapter,
  movieId,
  filePath,
  onClick,
}: {
  chapter: ChapterInfo;
  movieId: string;
  filePath: string;
  onClick: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.htpc.movies
      .chapterThumbnail(movieId, filePath, chapter.timeMs, chapter.index)
      .then((url) => {
        if (!cancelled && url) setThumbUrl(url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [movieId, filePath, chapter.timeMs, chapter.index]);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-2 rounded-[var(--radius-card)] transition-colors hover:bg-white/5 text-left"
      style={{ border: "1px solid var(--border-default)" }}
    >
      <div
        className="flex-shrink-0 rounded overflow-hidden bg-black/30"
        style={{ width: 64, height: 36 }}
      >
        {thumbUrl ? (
          <img
            src={scaledImageUrl(thumbUrl, 64, 36)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: "var(--surface-1)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: "var(--text-secondary)" }}>
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
          {chapter.title}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {fmtTime(chapter.timeMs)}
        </span>
      </div>
    </button>
  );
}

export const VideoFileDetails: React.FC<VideoFileDetailsProps> = ({ movie, onPlayChapter }) => {
  const hasFileDetails =
    movie.hdr !== undefined ||
    movie.container ||
    movie.codec ||
    movie.audioCodec ||
    movie.resolution ||
    movie.audioChannels !== undefined;

  const hasTracks =
    (movie.audioTracks && movie.audioTracks.length > 0) ||
    (movie.subtitleTracks && movie.subtitleTracks.length > 0);

  const hasChapters = movie.chapters && movie.chapters.length > 0;

  if (!hasFileDetails && !hasTracks && !hasChapters) return null;

  const handleChapterClick = (chapter: ChapterInfo) => {
    if (!onPlayChapter) return;
    if (movie.runtime && movie.runtime > 0) {
      const fraction = chapter.timeMs / 1000 / movie.runtime;
      onPlayChapter(Math.min(fraction, 0.95));
    } else {
      onPlayChapter(0);
    }
  };

  return (
    <div className="mt-2">
      <div
        className="text-xs font-semibold uppercase tracking-wide mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        File Details
      </div>

      {hasFileDetails && (
        <div
          className="rounded-[var(--radius-card)] p-3 mb-3"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          {movie.hdr !== undefined && (
            <MetaRow label="HDR" value={movie.hdr ? "Yes" : "No"} badge={movie.hdr} />
          )}
          {movie.resolution && (
            <MetaRow label="Resolution" value={movie.resolution} />
          )}
          {movie.codec && (
            <MetaRow label="Video Codec" value={movie.codec} />
          )}
          {movie.container && (
            <MetaRow label="Container" value={movie.container} />
          )}
          {movie.audioCodec && (
            <MetaRow label="Audio Codec" value={movie.audioCodec} />
          )}
          {movie.audioChannelLayout && (
            <MetaRow label="Audio Channels" value={movie.audioChannelLayout} />
          )}
          {movie.audioChannels !== undefined && !movie.audioChannelLayout && (
            <MetaRow label="Audio Channels" value={String(movie.audioChannels)} />
          )}
        </div>
      )}

      {hasTracks && (
        <div
          className="rounded-[var(--radius-card)] p-3 mb-3"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <TrackList
            title="Audio Tracks"
            tracks={movie.audioTracks ?? []}
            render={(t: AudioTrackInfo) => (
              <span>
                {t.title || t.language || `Track ${t.id + 1}`}
                {t.codec && <span style={{ color: "var(--text-secondary)" }}> - {t.codec}</span>}
                {t.channelLayout && <span style={{ color: "var(--text-secondary)" }}> ({t.channelLayout})</span>}
                {t.default && <span style={{ color: "var(--accent)" }}> - default</span>}
              </span>
            )}
          />
          <TrackList
            title="Subtitle Tracks"
            tracks={movie.subtitleTracks ?? []}
            render={(t: SubtitleTrackInfo) => (
              <span>
                {t.title || t.language || `Track ${t.id + 1}`}
                {t.codec && <span style={{ color: "var(--text-secondary)" }}> - {t.codec}</span>}
                {t.default && <span style={{ color: "var(--accent)" }}> - default</span>}
              </span>
            )}
          />
        </div>
      )}

      {hasChapters && (
        <div>
          <div
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Chapters ({movie.chapters!.length})
          </div>
          <div className="space-y-1.5">
            {movie.chapters!.map((ch) => (
              <ChapterItem
                key={ch.index}
                chapter={ch}
                movieId={movie.id}
                filePath={movie.filePath}
                onClick={() => handleChapterClick(ch)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
