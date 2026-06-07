import React, { useEffect, useRef } from "react";

export type CursorStyle =
  | "default"
  | "pointer"
  | "text"
  | "vertical-text"
  | "grab"
  | "grabbing"
  | "col-resize"
  | "row-resize"
  | "wait"
  | "progress";

interface VirtualCursorProps {
  /** Mutable ref containing live screen position. Updated by the hook, read by rAF. */
  posRef: React.RefObject<{ x: number; y: number }>;
  /** Whether the cursor should be visible */
  visible: boolean;
  /** CSS cursor type detected under the virtual pointer */
  hoverStyle?: CursorStyle;
  /** True while wiggle expansion is active */
  expanded?: boolean;
}

function arrowPath(ctx: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 17 * s);
  ctx.lineTo(x + 4 * s, y + 13 * s);
  ctx.lineTo(x + 7 * s, y + 20 * s);
  ctx.lineTo(x + 10 * s, y + 18.5 * s);
  ctx.lineTo(x + 7 * s, y + 12 * s);
  ctx.lineTo(x + 13 * s, y + 12 * s);
  ctx.closePath();
}

const CURSORS: Record<
  CursorStyle,
  (ctx: CanvasRenderingContext2D, x: number, y: number, flash: number) => void
> = {
  default: (ctx, x, y, flash) => {
    ctx.save();
    const ag = ctx.createRadialGradient(x + 5, y + 8, 0, x + 5, y + 8, 32);
    ag.addColorStop(0, `rgba(255,100,30,${0.14 + flash * 0.18})`);
    ag.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12 + flash * 26;
    ctx.shadowColor = "#FF4400";

    arrowPath(ctx, x, y);
    ctx.fillStyle = `rgba(22,8,4,${0.90 + flash * 0.08})`;
    ctx.fill();

    arrowPath(ctx, x, y);
    ctx.strokeStyle = `hsl(22,100%,${50 + flash * 28}%)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1);
    ctx.lineTo(x + 1, y + 15);
    ctx.strokeStyle = `rgba(255,160,80,${0.38 + flash * 0.32})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.shadowColor = "#FFCC88";
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "#FFCC88";
    ctx.fill();
    ctx.restore();
  },

  pointer: (ctx, x, y, flash) => {
    ctx.save();
    const ag = ctx.createRadialGradient(x + 5, y + 8, 0, x + 5, y + 8, 32);
    ag.addColorStop(0, `rgba(80,180,255,${0.14 + flash * 0.18})`);
    ag.addColorStop(1, "rgba(0,100,255,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(x + 5, y + 8, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 12 + flash * 26;
    ctx.shadowColor = "#4488FF";

    arrowPath(ctx, x, y);
    ctx.fillStyle = `rgba(4,8,22,${0.90 + flash * 0.08})`;
    ctx.fill();

    arrowPath(ctx, x, y);
    ctx.strokeStyle = `hsl(210,100%,${55 + flash * 28}%)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1);
    ctx.lineTo(x + 1, y + 15);
    ctx.strokeStyle = `rgba(120,200,255,${0.38 + flash * 0.32})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.shadowColor = "#88CCFF";
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "#88CCFF";
    ctx.fill();
    ctx.restore();
  },

  text: (ctx, x, y, flash) => {
    ctx.save();
    ctx.shadowBlur = 10 + flash * 20;
    ctx.shadowColor = "#CCCCCC";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x - 1, y - 10, 2, 20);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 1.5, y - 10.5, 3, 21);
    ctx.restore();
  },

  "vertical-text": (ctx, x, y, flash) => {
    ctx.save();
    ctx.shadowBlur = 10 + flash * 20;
    ctx.shadowColor = "#CCCCCC";
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x - 10, y - 1, 20, 2);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 10.5, y - 1.5, 21, 3);
    ctx.restore();
  },

  grab: (ctx, x, y, flash) => {
    ctx.save();
    ctx.shadowBlur = 12 + flash * 26;
    ctx.shadowColor = "#44FF88";

    arrowPath(ctx, x, y);
    ctx.fillStyle = `rgba(4,22,8,${0.90 + flash * 0.08})`;
    ctx.fill();

    arrowPath(ctx, x, y);
    ctx.strokeStyle = `hsl(140,100%,${50 + flash * 28}%)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 1, y + 1);
    ctx.lineTo(x + 1, y + 15);
    ctx.strokeStyle = `rgba(120,255,160,${0.38 + flash * 0.32})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.shadowColor = "#88FFAA";
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = "#88FFAA";
    ctx.fill();
    ctx.restore();
  },

  grabbing: (ctx, x, y, flash) => {
    CURSORS.grab(ctx, x, y, flash);
  },

  "col-resize": (ctx, x, y, flash) => {
    CURSORS.grab(ctx, x, y, flash);
  },

  "row-resize": (ctx, x, y, flash) => {
    CURSORS.grab(ctx, x, y, flash);
  },

  wait: (ctx, x, y, flash) => {
    ctx.save();
    ctx.shadowBlur = 12 + flash * 26;
    ctx.shadowColor = "#FFAA00";

    arrowPath(ctx, x, y);
    ctx.fillStyle = `rgba(22,16,4,${0.90 + flash * 0.08})`;
    ctx.fill();

    arrowPath(ctx, x, y);
    ctx.strokeStyle = `hsl(45,100%,${50 + flash * 28}%)`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#FFAA00";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#FFAA00";
    ctx.fill();
    ctx.restore();
  },

  progress: (ctx, x, y, flash) => {
    CURSORS.wait(ctx, x, y, flash);
  },
};

export const VirtualCursor: React.FC<VirtualCursorProps> = ({
  posRef,
  visible,
  hoverStyle = "default",
  expanded = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const flashRef = useRef(0);
  const lastRef = useRef<number>(0);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (ts: number) => {
      const dt = lastRef.current ? Math.min((ts - lastRef.current) / 1000, 0.05) : 0.016;
      lastRef.current = ts;
      flashRef.current = Math.max(0, flashRef.current - dt * 5.8);

      // Read live position directly from the ref (no React re-render needed)
      const pos = posRef.current ?? { x: 0, y: 0 };

      // Detect rapid movement for flash effect
      const dx = pos.x - lastPosRef.current.x;
      const dy = pos.y - lastPosRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 3) {
        flashRef.current = Math.min(flashRef.current + 0.15, 1);
      }
      lastPosRef.current = { x: pos.x, y: pos.y };

      const ctx = canvas.getContext("2d")!;
      const W = canvas.width;
      const H = canvas.height;

      // Clear entire canvas (transparent)
      ctx.clearRect(0, 0, W, H);

      if (visible) {
        const fl = flashRef.current;
        // Apply expansion scale
        if (expanded) {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.scale(2, 2);
          ctx.translate(-pos.x, -pos.y);
        }
        CURSORS[hoverStyle](ctx, pos.x, pos.y, fl);
        if (expanded) {
          ctx.restore();
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [visible, hoverStyle, expanded, posRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 999999,
      }}
    />
  );
};
