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
  /** Mutable ref containing live screen position */
  posRef: React.RefObject<{ x: number; y: number }>;
  /** Whether the cursor should be visible */
  visible: boolean;
  /** CSS cursor type detected under the virtual pointer */
  hoverStyle?: CursorStyle;
  /** True while wiggle expansion is active */
  expanded?: boolean;
  /** Base hue (0-360) for this controller's color */
  hue?: number;
  /** Mutable ref for click flash intensity (0..1), read by rAF loop */
  clickRef?: React.RefObject<number>;
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

function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flash: number,
  hue: number,
  style: CursorStyle,
  clickFlash: number
) {
  const glow = `hsl(${hue}, 100%, 60%)`;
  const fillDark = `rgba(10,10,10,${0.90 + flash * 0.08})`;
  const strokeMain = `hsl(${hue}, 100%, ${50 + flash * 28}%)`;
  const highlight = `hsla(${hue}, 100%, 75%, ${0.38 + flash * 0.32})`;
  const dotColor = `hsl(${hue}, 80%, 82%)`;

  ctx.save();

  if (style === "text" || style === "vertical-text") {
    ctx.shadowBlur = 10 + flash * 20;
    ctx.shadowColor = "#CCCCCC";
    ctx.fillStyle = "#FFFFFF";
    if (style === "text") {
      ctx.fillRect(x - 1, y - 10, 2, 20);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 1.5, y - 10.5, 3, 21);
    } else {
      ctx.fillRect(x - 10, y - 1, 20, 2);
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 10.5, y - 1.5, 21, 3);
    }
    ctx.restore();
    return;
  }

  // Ambient halo
  const ag = ctx.createRadialGradient(x + 5, y + 8, 0, x + 5, y + 8, 32);
  ag.addColorStop(0, `hsla(${hue}, 100%, 55%, ${0.14 + flash * 0.18})`);
  ag.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(x + 5, y + 8, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 12 + flash * 26;
  ctx.shadowColor = glow;

  arrowPath(ctx, x, y);
  ctx.fillStyle = fillDark;
  ctx.fill();

  arrowPath(ctx, x, y);
  ctx.strokeStyle = strokeMain;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + 1, y + 1);
  ctx.lineTo(x + 1, y + 15);
  ctx.strokeStyle = highlight;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.shadowBlur = 20;
  ctx.shadowColor = dotColor;
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // Click ripple
  if (clickFlash > 0) {
    const rippleRadius = 8 + clickFlash * 28;
    const rippleAlpha = clickFlash * 0.7;
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, rippleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 65%, ${rippleAlpha})`;
    ctx.lineWidth = 2 + clickFlash * 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + 2, y + 3, rippleRadius * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${rippleAlpha * 0.6})`;
    ctx.lineWidth = 1 + clickFlash;
    ctx.stroke();
  }

  // Style-specific badge
  if (style === "pointer") {
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 13);
    ctx.quadraticCurveTo(x + 20, y + 9, x + 22, y + 12);
    ctx.quadraticCurveTo(x + 23, y + 16, x + 19, y + 18);
    ctx.quadraticCurveTo(x + 15, y + 20, x + 14, y + 13);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.9)`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 100%, 40%)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (style === "wait" || style === "progress") {
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 4, 0, Math.PI * 2);
    ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + 16, y + 16, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
  } else if (style === "grab" || style === "grabbing" || style === "col-resize" || style === "row-resize") {
    ctx.beginPath();
    ctx.arc(x + 16, y + 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.9)`;
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue}, 100%, 40%)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

const DEVICE_HUES = [22, 210, 140, 280, 45, 330, 180, 0];

export function getDeviceHue(index: number): number {
  return DEVICE_HUES[index % DEVICE_HUES.length];
}

export const VirtualCursor: React.FC<VirtualCursorProps> = ({
  posRef,
  visible,
  hoverStyle = "default",
  expanded = false,
  hue = 22,
  clickRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const flashRef = useRef(0);
  const clickFlashRef = useRef(0);
  const lastClickTriggerRef = useRef(0);
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

      // Detect click trigger spike
      const clickTrigger = clickRef?.current ?? 0;
      if (clickTrigger > 0 && clickTrigger !== lastClickTriggerRef.current) {
        clickFlashRef.current = 1;
        lastClickTriggerRef.current = clickTrigger;
      }
      clickFlashRef.current = Math.max(0, clickFlashRef.current - dt * 6);

      const pos = posRef.current ?? { x: 0, y: 0 };

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

      ctx.clearRect(0, 0, W, H);

      if (visible) {
        const fl = flashRef.current;
        const cfl = clickFlashRef.current;
        if (expanded) {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.scale(2, 2);
          ctx.translate(-pos.x, -pos.y);
        }
        drawCursor(ctx, pos.x, pos.y, fl, hue, hoverStyle, cfl);
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
  }, [visible, hoverStyle, expanded, hue, posRef]);

  useEffect(() => {
    lastPosRef.current = { x: posRef.current.x, y: posRef.current.y };
  }, [posRef]);

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
