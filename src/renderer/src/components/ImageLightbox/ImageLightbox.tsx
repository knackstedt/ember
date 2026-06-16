import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ImageLightboxProps {
  open: boolean;
  images: string[];
  initialIndex?: number;
  alt?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  open,
  images,
  initialIndex = 0,
  alt = "",
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open, onClose);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const goPrev = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string };
      if (detail?.action === "cancel") {
        onClose();
      } else if (detail?.action === "left") {
        goPrev();
      } else if (detail?.action === "right") {
        goNext();
      }
    };
    window.addEventListener("htpc:nav", handler);
    return () => window.removeEventListener("htpc:nav", handler);
  }, [open, onClose, goPrev, goNext]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext]);

  const src = images[index];
  const hasMultiple = images.length > 1;

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            ref={containerRef}
            className="relative flex items-center justify-center p-4"
            style={{ maxWidth: "90vw", maxHeight: "90vh" }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-2 right-2 p-2 rounded-full hover:bg-white/20 transition-colors z-10"
              style={{ color: "#fff" }}
              onClick={onClose}
              aria-label="Close lightbox"
            >
              <X size={24} />
            </button>

            {hasMultiple && (
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/20 transition-colors z-10"
                style={{ color: "#fff" }}
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                aria-label="Previous image"
              >
                <ChevronLeft size={32} />
              </button>
            )}

            {hasMultiple && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/20 transition-colors z-10"
                style={{ color: "#fff" }}
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                aria-label="Next image"
              >
                <ChevronRight size={32} />
              </button>
            )}

            <AnimatePresence mode="wait">
              <motion.img
                key={src}
                src={src}
                alt={alt}
                className="rounded-[var(--radius-card)] object-contain"
                style={{
                  maxWidth: "85vw",
                  maxHeight: "85vh",
                  boxShadow: "0 24px 48px rgba(0,0,0,0.5)",
                }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
              />
            </AnimatePresence>

            {hasMultiple && (
              <div
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium z-10"
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                }}
              >
                {index + 1} / {images.length}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
