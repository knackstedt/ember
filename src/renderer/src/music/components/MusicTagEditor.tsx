import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Save, X, Tag } from "lucide-react";
import { MusicTrack, AudioTags } from "../../../../shared/types";
import { OskInput } from "../../components/OnScreenKeyboard/OnScreenKeyboard";
import { useToastStore } from "../../store/toast.store";
import { getTrackDisplayName } from "../lib/track-title";

interface FieldDef {
  key: keyof AudioTags;
  label: string;
  type: "text" | "number";
}

const FIELDS: FieldDef[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "artist", label: "Artist", type: "text" },
  { key: "album", label: "Album", type: "text" },
  { key: "albumArtist", label: "Album Artist", type: "text" },
  { key: "genre", label: "Genre", type: "text" },
  { key: "year", label: "Year", type: "number" },
  { key: "trackNumber", label: "Track Number", type: "number" },
  { key: "discNumber", label: "Disc Number", type: "number" },
];

const ACTIONS = ["save", "cancel"] as const;
type Action = typeof ACTIONS[number];

interface MusicTagEditorProps {
  track: MusicTrack | null;
  onClose: () => void;
  onSave: (tags: AudioTags) => Promise<{ success: boolean; error?: string }>;
}

export const MusicTagEditor: React.FC<MusicTagEditorProps> = React.memo(({
  track,
  onClose,
  onSave,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [oskField, setOskField] = useState<FieldDef | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const valuesRef = useRef(values);
  valuesRef.current = values;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const oskFieldRef = useRef(oskField);
  oskFieldRef.current = oskField;

  const totalItems = FIELDS.length + ACTIONS.length;

  // Initialize values when track changes
  useEffect(() => {
    if (!track) return;
    setValues({
      title: track.title ?? "",
      artist: track.artist ?? "",
      album: track.album ?? "",
      albumArtist: track.albumArtist ?? "",
      genre: track.genre ?? "",
      year: track.year ? String(track.year) : "",
      trackNumber: track.trackNumber ? String(track.trackNumber) : "",
      discNumber: track.discNumber ? String(track.discNumber) : "",
    });
    setFocusedIndex(0);
    setOskField(null);
    setSaving(false);
  }, [track]);

  // Scroll focused field into view
  useEffect(() => {
    if (!containerRef.current) return;
    const els = containerRef.current.querySelectorAll<HTMLElement>("[data-tag-field]");
    const target = els[focusedIndex];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [focusedIndex]);

  // Controller navigation
  useEffect(() => {
    if (!track) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string };
      const action = detail?.action;
      if (!action) return;

      if (oskFieldRef.current) {
        // OSK is open; let it handle its own events
        return;
      }

      const currentFocused = focusedIndexRef.current;

      switch (action) {
        case "up": {
          setFocusedIndex((prev) => Math.max(0, prev - 1));
          break;
        }
        case "down": {
          setFocusedIndex((prev) => Math.min(totalItems - 1, prev + 1));
          break;
        }
        case "confirm": {
          if (currentFocused < FIELDS.length) {
            setOskField(FIELDS[currentFocused]);
          } else {
            const act = ACTIONS[currentFocused - FIELDS.length];
            if (act === "cancel") {
              onClose();
            } else if (act === "save") {
              void handleSave();
            }
          }
          break;
        }
        case "cancel": {
          onClose();
          break;
        }
      }
    };

    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [track, onClose]);

  const handleSave = async () => {
    if (!track || saving) return;
    setSaving(true);

    const tags: AudioTags = {
      title: values.title?.trim() || undefined,
      artist: values.artist?.trim() || undefined,
      album: values.album?.trim() || undefined,
      albumArtist: values.albumArtist?.trim() || undefined,
      genre: values.genre?.trim() || undefined,
      year: values.year ? parseInt(values.year, 10) || undefined : undefined,
      trackNumber: values.trackNumber ? parseInt(values.trackNumber, 10) || undefined : undefined,
      discNumber: values.discNumber ? parseInt(values.discNumber, 10) || undefined : undefined,
    };

    const result = await onSave(tags);
    setSaving(false);

    if (result.success) {
      useToastStore.getState().push({
        type: "success",
        message: `Tags saved for "${getTrackDisplayName(track)}"`,
      });
      onClose();
    } else {
      useToastStore.getState().push({
        type: "error",
        message: `Failed to save tags: ${result.error ?? "Unknown error"}`,
      });
    }
  };

  const handleOskSubmit = (value: string) => {
    if (!oskField) return;
    setValues((prev) => ({ ...prev, [oskField.key]: value }));
    setOskField(null);
  };

  const isFocused = (index: number) => focusedIndex === index;

  const focusClass = (index: number) =>
    isFocused(index)
      ? "ring-2 ring-accent"
      : "";

  if (!track) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center p-6"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(8px)",
          zIndex: 101,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          ref={containerRef}
          className="w-full max-w-lg max-h-full overflow-y-auto rounded-xl p-6 flex flex-col gap-4"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <Tag size={18} style={{ color: "var(--color-accent)" }} />
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
              Edit Tags
            </h2>
            <span className="ml-auto text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
              {getTrackDisplayName(track)}
            </span>
          </div>

          {/* Fields */}
          {FIELDS.map((field, index) => (
            <div
              key={field.key}
              data-tag-field
              className={`flex flex-col gap-1 rounded-lg p-3 transition-all ${focusClass(index)}`}
              style={{
                background: isFocused(index) ? "var(--color-accent-dim)" : "transparent",
              }}
            >
              <label
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--color-text-dim)" }}
              >
                {field.label}
              </label>
              <div
                className="text-sm font-medium truncate"
                style={{ color: "var(--color-text)" }}
              >
                {values[field.key] || "—"}
              </div>
            </div>
          ))}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2">
            <button
              data-tag-field
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${focusClass(FIELDS.length)}`}
              style={{
                background: isFocused(FIELDS.length) ? "var(--color-accent)" : "var(--color-bg)",
                color: isFocused(FIELDS.length) ? "var(--color-bg)" : "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              data-tag-field
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${focusClass(FIELDS.length + 1)}`}
              style={{
                background: isFocused(FIELDS.length + 1) ? "var(--color-accent)" : "var(--color-bg)",
                color: isFocused(FIELDS.length + 1) ? "var(--color-bg)" : "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
              onClick={onClose}
            >
              <X size={16} />
              Cancel
            </button>
          </div>
        </div>

        {/* On-screen keyboard for focused field */}
        {oskField && (
          <OskInput
            open={!!oskField}
            onClose={() => setOskField(null)}
            onSubmit={handleOskSubmit}
            initialValue={values[oskField.key] ?? ""}
            placeholder={`Enter ${oskField.label}`}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
});
