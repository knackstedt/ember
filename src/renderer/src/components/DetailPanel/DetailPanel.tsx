import React, { useState, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { scaledImageUrl } from "../../lib/image-url";

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  coverUrl?: string;
  backdropUrl?: string;
  description?: string;
  metadata?: { label: string; value: string }[];
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  hideTags?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  open,
  onClose,
  title,
  coverUrl,
  backdropUrl,
  description,
  metadata,
  tags,
  onTagsChange,
  hideTags,
  actions,
  children,
}) => {
  const [tagInput, setTagInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useFocusTrap(containerRef, open, onClose);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (!trimmed || tags?.includes(trimmed)) return;
    onTagsChange?.([...(tags ?? []), trimmed]);
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    onTagsChange?.((tags ?? []).filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          className="absolute top-0 bottom-0 flex flex-col overflow-hidden"
          style={{
            width: "min(480px, 90%)",
            right: 0,
            background: "var(--surface-2)",
            backdropFilter: "blur(var(--blur-panel))",
            borderLeft: "1px solid var(--border-default)",
          }}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
            {backdropUrl && (
              <div className="relative h-48 overflow-hidden flex-shrink-0">
                <img
                  src={scaledImageUrl(backdropUrl, 480, 192)}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--surface-2)]" />
              </div>
            )}

            <div className="flex gap-4 p-4 flex-shrink-0">
              {coverUrl && (
                <img
                  src={scaledImageUrl(coverUrl, 96, 144)}
                  alt={title}
                  className="w-24 h-36 object-cover rounded-[var(--radius-card)] flex-shrink-0"
                  style={{ boxShadow: "var(--shadow-card)" }}
                />
              )}
              <div className="flex flex-col justify-end gap-1 min-w-0">
                <h2
                  className="text-xl font-bold leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {title}
                </h2>
                {metadata?.slice(0, 3).map((m) => (
                  <div key={m.label} className="flex gap-1 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>
                      {m.label}:
                    </span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {actions && (
              <div className="flex gap-2 px-4 pb-3 flex-shrink-0 flex-wrap">
                {actions}
              </div>
            )}

            <div
              className="flex-1 overflow-y-auto px-4 pb-4 gpu-scroll"
              style={{ color: "var(--text-secondary)" }}
            >
              {description && (
                <p className="text-sm leading-relaxed mb-4">{description}</p>
              )}
              {metadata && metadata.length > 3 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                  {metadata.slice(3).map((m) => (
                    <React.Fragment key={m.label}>
                      <span style={{ color: "var(--text-secondary)" }}>
                        {m.label}
                      </span>
                      <span style={{ color: "var(--text-primary)" }}>
                        {m.value}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {!hideTags && onTagsChange !== undefined && (
                <div className="mb-4">
                  <div
                    className="text-xs font-semibold uppercase tracking-wide mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background:
                            "color-mix(in srgb, var(--accent) 18%, transparent)",
                          border:
                            "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {tag}
                        <button
                          className="flex items-center opacity-60 hover:opacity-100 transition-opacity leading-none"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() => handleRemoveTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    ref={inputRef}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add tag…"
                    className="w-full text-xs px-2.5 py-1 rounded outline-none"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                      color: "var(--text-primary)",
                      caretColor: "var(--accent)",
                    }}
                  />
                </div>
              )}
              {children}
            </div>

            <button
              className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/10 transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
      )}
    </AnimatePresence>
  );
};
