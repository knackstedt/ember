import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePos();
    const handle = () => updatePos();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [visible, updatePos]);

  const child = React.Children.only(children) as React.ReactElement;
  const clonedChild = React.cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const origRef = (child as any).ref;
      if (typeof origRef === "function") {
        origRef(node);
      } else if (origRef && "current" in origRef) {
        (origRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      updatePos();
      setVisible(true);
      (child.props as any).onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setVisible(false);
      (child.props as any).onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      updatePos();
      setVisible(true);
      (child.props as any).onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setVisible(false);
      (child.props as any).onBlur?.(e);
    },
  });

  return (
    <>
      {clonedChild}
      {content && createPortal(
        <AnimatePresence>
          {visible && (
            <div
              style={{
                position: "fixed",
                left: pos.x,
                top: pos.y - 6,
                transform: "translate(-50%, -100%)",
                zIndex: 9999,
                pointerEvents: "none",
              }}
            >
              <motion.div
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  background: "rgba(0, 0, 0, 0.9)",
                  color: "#fff",
                  fontSize: "11px",
                  lineHeight: "1.4",
                  maxWidth: "220px",
                  whiteSpace: "normal",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
