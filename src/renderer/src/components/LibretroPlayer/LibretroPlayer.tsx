import React, { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useLibretroPlayerStore } from "../../store/libretroPlayer.store";
import { VERTEX_SHADER, wrapFragmentBody, getShaderPreset } from "./shaders";
import { GamePlatform } from "../../../../shared/types";

function platformToButtonMap(_platform: GamePlatform): Record<string, number> {
  const common: Record<string, number> = {
    ArrowUp: 4,
    ArrowDown: 5,
    ArrowLeft: 6,
    ArrowRight: 7,
    Enter: 3,
    Shift: 10,
    z: 0,
    x: 1,
    a: 8,
    s: 9,
    q: 12,
    w: 13,
    e: 14,
    r: 15,
  };
  return common;
}

const PIXEL_FORMAT_0RGB1555 = 0;
const PIXEL_FORMAT_XRGB8888 = 1;
const PIXEL_FORMAT_RGB565 = 2;
const PIXEL_FORMAT_RGBA8888 = 3;

export const LibretroPlayer: React.FC = () => {
  const {
    open,
    title,
    platform,
    shader,
    coreId,
    avInfo,
    isRunning,
    error,
    close,
    reset,
  } = useLibretroPlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(performance.now());
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const [showControls, setShowControls] = useState(false);
  const [currentFps, setCurrentFps] = useState(0);
  const lastFormatRef = useRef<number>(-1);

  const compileShader = useCallback(
    (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`[LibretroPlayer] Shader compile error: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    },
    []
  );

  const buildProgram = useCallback(
    (gl: WebGLRenderingContext, fragmentSource: string) => {
      const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      if (!vs || !fs) return null;

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(`[LibretroPlayer] Program link error: ${gl.getProgramInfoLog(program)}`);
        gl.deleteProgram(program);
        return null;
      }

      gl.useProgram(program);

      const posLoc = gl.getAttribLocation(program, "a_position");
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const texLoc = gl.getAttribLocation(program, "a_texCoord");
      const texBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      uniformsRef.current = {
        u_source: gl.getUniformLocation(program, "u_source"),
        u_resolution: gl.getUniformLocation(program, "u_resolution"),
        u_intensity: gl.getUniformLocation(program, "u_intensity"),
        u_time: gl.getUniformLocation(program, "u_time"),
        u_format: gl.getUniformLocation(program, "u_format"),
      };

      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return program;
    },
    [compileShader]
  );

  const initGl = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
    });
    if (!gl) {
      console.error("[LibretroPlayer] WebGL not available");
      return;
    }

    glRef.current = gl;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    textureRef.current = texture;

    const preset = getShaderPreset(shader ?? "none") ?? getShaderPreset("none")!;
    programRef.current = buildProgram(gl, wrapFragmentBody(preset.fragmentBody));

    startTimeRef.current = performance.now();
  }, [shader, buildProgram]);

  useEffect(() => {
    if (!open || !glRef.current) return;
    const preset = getShaderPreset(shader ?? "none") ?? getShaderPreset("none")!;
    programRef.current = buildProgram(glRef.current, wrapFragmentBody(preset.fragmentBody));
  }, [shader, open, buildProgram]);

  useEffect(() => {
    if (!open || coreId === null || !isRunning) return;

    initGl();
    const gl = glRef.current;
    if (!gl) return;

    let lastTime = performance.now();
    let frameCount = 0;
    let cancelled = false;

    const renderLoop = async () => {
      if (cancelled) return;

      try {
        const frame = await window.htpc.libretro.getFrameBuffer(coreId);
        if (frame && frame.width > 0 && frame.height > 0) {
          const canvas = canvasRef.current;
          if (!canvas) return;

          const container = canvas.parentElement;
          if (container) {
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const frameAspect = frame.width / frame.height;
            const containerAspect = containerWidth / containerHeight;
            let drawWidth = containerWidth;
            let drawHeight = containerHeight;
            if (frameAspect > containerAspect) {
              drawHeight = containerWidth / frameAspect;
            } else {
              drawWidth = containerHeight * frameAspect;
            }
            canvas.style.width = `${drawWidth}px`;
            canvas.style.height = `${drawHeight}px`;
          }

          if (canvas.width !== frame.width || canvas.height !== frame.height) {
            canvas.width = frame.width;
            canvas.height = frame.height;
            gl.viewport(0, 0, frame.width, frame.height);
          }

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, textureRef.current);

          const pixelData = new Uint8Array(frame.data);

          switch (frame.format) {
            case PIXEL_FORMAT_RGB565: {
              // 16-bit RGB: upload as RGB + UNSIGNED_SHORT_5_6_5
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGB,
                frame.width,
                frame.height,
                0,
                gl.RGB,
                gl.UNSIGNED_SHORT_5_6_5,
                pixelData
              );
              break;
            }
            case PIXEL_FORMAT_0RGB1555: {
              // 16-bit 0RGB: upload as RGBA + UNSIGNED_SHORT_5_5_5_1
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                frame.width,
                frame.height,
                0,
                gl.RGBA,
                gl.UNSIGNED_SHORT_5_5_5_1,
                pixelData
              );
              break;
            }
            default: {
              // XRGB8888 and RGBA8888: upload as RGBA + UNSIGNED_BYTE
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                frame.width,
                frame.height,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                pixelData
              );
            }
          }

          if (programRef.current) {
            gl.useProgram(programRef.current);
            gl.uniform1i(uniformsRef.current.u_source, 0);
            gl.uniform2f(uniformsRef.current.u_resolution, frame.width, frame.height);
            gl.uniform1f(uniformsRef.current.u_intensity, 1.0);
            gl.uniform1f(
              uniformsRef.current.u_time,
              (performance.now() - startTimeRef.current) / 1000.0
            );
            gl.uniform1i(uniformsRef.current.u_format, frame.format);
          }

          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

          frameCount++;
          const now = performance.now();
          if (now - lastTime >= 1000) {
            setCurrentFps(frameCount);
            frameCount = 0;
            lastTime = now;
          }
        }
      } catch (err) {
        // Frame fetch errors are expected during shutdown
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [open, coreId, isRunning, initGl]);

  useEffect(() => {
    if (!open || coreId === null) return;

    const buttonMap = platformToButtonMap(platform);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "F1") {
        reset();
        return;
      }
      const id = buttonMap[e.key];
      if (id !== undefined) {
        window.htpc.libretro.setInput(coreId, 0, 1, 0, id, 1);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const id = buttonMap[e.key];
      if (id !== undefined) {
        window.htpc.libretro.setInput(coreId, 0, 1, 0, id, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open, coreId, platform, close, reset]);

  useEffect(() => {
    if (!open || coreId === null) return;

    const gamepadMap: Record<string, number> = {
      south: 0,
      east: 1,
      west: 8,
      north: 9,
      select: 2,
      start: 3,
      dpad_up: 4,
      dpad_down: 5,
      dpad_left: 6,
      dpad_right: 7,
      left_bumper: 10,
      right_bumper: 11,
    };

    const unsub = window.htpc.input.onEvent((ev) => {
      if (ev.type !== "button_press" && ev.type !== "button_release") return;
      const value = ev.type === "button_press" ? 1 : 0;
      const id = gamepadMap[ev.action ?? ""];
      if (id !== undefined) {
        window.htpc.libretro.setInput(coreId, 0, 1, 0, id, value);
      }
    });

    return () => {
      unsub();
    };
  }, [open, coreId]);

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseMove={() => setShowControls(true)}
    >
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: "pixelated",
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
          zIndex: 2,
          opacity: showControls ? 1 : 0,
          transition: "opacity 0.3s",
          pointerEvents: showControls ? "auto" : "none",
        }}
        onMouseLeave={() => setShowControls(false)}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-medium truncate"
            style={{ color: "rgba(255,255,255,0.9)", maxWidth: 400 }}
          >
            {title}
          </span>
          {avInfo && (
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              {avInfo.baseWidth}x{avInfo.baseHeight} @ {currentFps}fps
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => reset()}
            className="px-3 py-1.5 rounded text-xs font-medium hover:bg-white/20 transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
          >
            Reset
          </button>
          <button
            onClick={() => close()}
            className="px-3 py-1.5 rounded text-xs font-medium hover:bg-white/20 transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.85)",
            zIndex: 10,
            padding: 32,
          }}
        >
          <p className="text-red-400 text-sm font-medium mb-4 text-center max-w-md">
            {error}
          </p>
          <button
            onClick={() => close()}
            className="px-4 py-2 rounded text-sm font-medium hover:bg-white/20 transition-colors"
            style={{ color: "#fff", background: "rgba(255,255,255,0.1)" }}
          >
            Close
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {!isRunning && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.7)",
            zIndex: 5,
          }}
        >
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"
            />
            <span className="text-sm text-white/70">Loading core...</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};
