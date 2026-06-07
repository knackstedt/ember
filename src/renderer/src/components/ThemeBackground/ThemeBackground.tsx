import React, { useEffect, useRef, useState } from "react";
import { MatrixAnimation } from "matrix-animation";
import { useSettingsStore } from "../../store/settings.store";
import {
  MatrixPreset,
  BackgroundSettings,
  DailyBackgroundSource,
} from "../../../../shared/types";

const r = (a: number, b: number): string =>
  Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join("");

const MATRIX_PRESETS: Record<
  MatrixPreset,
  ConstructorParameters<typeof MatrixAnimation>[1]
> = {
  cyberpunk: {
    fadeStrength: 0.04,
    rainWidth: 10,
    rainHeight: 18,
    rainDrop: {
      headColor: "rgba(255,45,120,0.95)",
      trailColors: [
        "rgba(255,45,120,0.3)",
        "rgba(160,32,240,0.2)",
        "rgba(255,0,255,0.1)",
      ],
      randomizeScale: true,
      randomizePosition: true,
      charArrays: [
        r(0xFF01, 0xFF5E), // fullwidth Latin  — glitched corp display text
        r(0xFF65, 0xFF9F), // half-width Katakana — neon sign kanji
        r(0x2500, 0x257F), // box drawing       — hardwired circuit traces
        r(0x2190, 0x21AF), // arrows            — data flow indicators
        r(0x2100, 0x214F), // letterlike        — hacked glyphs ℃℉™℗ℤℝℵ
      ],
      fontSize: 16,
      fontFamily: "monospace",
      alignToColumns: true,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      correlateScaleSpeed: false,
      minFrameDelay: 30,
      maxFrameDelay: 50,
      randomizeFrameDelay: true,
    },
    rainGenerator: { density: 1.5 },
  },
  "ocean-blue": {
    fadeStrength: 0.05,
    minFrameTime: 50,
    rainWidth: 10,
    rainHeight: 18,
    rainDrop: {
      headColor: "rgba(0,245,212,0.95)",
      trailColors: [
        "rgba(0,245,212,0.3)",
        "rgba(0,187,249,0.2)",
        "rgba(0,100,200,0.1)",
      ],
      charArrays: "🮤🮥🮦🮧🮨🮩🮪🮫🮬🮭🮮",
      randomizeScale: true,
      randomizePosition: true,
      fontSize: 14,
      fontFamily: "monospace",
      alignToColumns: true,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      correlateScaleSpeed: false,
      minFrameDelay: 30,
      maxFrameDelay: 50,
      randomizeFrameDelay: true,
    },
    rainGenerator: { density: .65 },
  },
  "fire-red": {
    fadeStrength: 0.04,
    rainWidth: 10,
    rainHeight: 24,
    rainDrop: {
      headColor: "rgba(255,200,100,0.95)",
      trailColors: [
        "rgba(255,100,50,0.3)",
        "rgba(200,50,0,0.2)",
        "rgba(100,0,0,0.1)",
      ],
      randomizeScale: true,
      randomizePosition: true,
      charArrays: "🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹",
      fontSize: 16,
      fontFamily: "monospace",
      alignToColumns: true,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 16,
      maxMoveSpeed: 24,
      correlateScaleSpeed: false,
      minFrameDelay: 50,
      maxFrameDelay: 100,
      randomizeFrameDelay: true,
    },
    rainGenerator: { density: 1 },
  },
  monochrome: {
    fadeStrength: 0.05,
    rainWidth: 10,
    rainHeight: 18,
    rainDrop: {
      headColor: "rgba(255,255,255,0.95)",
      trailColors: [
        "rgba(200,200,200,0.3)",
        "rgba(150,150,150,0.2)",
        "rgba(100,100,100,0.1)",
      ],
      charArrays: "⸪⸫⸬⸭⁖⁘⁙⁚⁛",
      randomizeScale: true,
      randomizePosition: true,
      fontSize: 14,
      fontFamily: "monospace",
      alignToColumns: true,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      correlateScaleSpeed: false,
      minFrameDelay: 30,
      maxFrameDelay: 50,
      randomizeFrameDelay: true,
    },
    rainGenerator: { density: .75 },
  },
  "purple-haze": {
    rainWidth: 10,
    rainHeight: 18,
    minFrameTime: 75,
    rainGenerator: { density: 0.5 },
    rainDrop: {
      direction: "TD",
      charArrays: [
        "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿∀∁∂∃∄∅∆∇∈∉∊∋∌∍∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯▀▁▂▃▄▅▆▇█▉▊▋▌▍▎▏▐░▒▓▔▕▖▗▘▙▚▛▜▝▞▟"
      ],
      headColor: "rgba(255,255,255,0.8)",
      trailColor: "rgba(140,62,225,1.00)",
      fontSize: 16,
      fontFamily: "monospace",
      randomizeScale: false,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      correlateScaleSpeed: false,
      minFrameDelay: 30,
      maxFrameDelay: 50,
      randomizePosition: true,
      randomizeFrameDelay: true,
      jitterLeftStrength: 0,
      jitterRightStrength: 0,
      jitterUpStrength: 0,
      jitterDownStrength: 0,
    },
    trailBloomSize: 0,
    trailBloomColor: "#ffffff",
    headBloomSize: 0,
    headBloomColor: "#ffffff",
    warmupIterations: 50,
    fadeStrength: 0.05,
  },
  "neon-pink": {
    fadeStrength: 0.04,
    rainWidth: 10,
    rainHeight: 18,
    minFrameDelay: 50,
    rainDrop: {
      headColor: "rgba(255,100,200,0.95)",
      trailColors: [
        "rgba(255,150,220,0.3)",
        "rgba(255,50,150,0.2)",
        "rgba(200,0,100,0.1)",
      ],
      randomizeScale: true,
      randomizePosition: true,
      charArrays: [
        "⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿⡀⡁⡂⡃⡄⡅⡆⡇⡈⡉⡊⡋⡌⡍⡎⡏⡐⡑⡒⡓⡔⡕⡖⡗⡘⡙⡚⡛⡜⡝⡞⡟⡠⡡⡢⡣⡤⡥⡦⡧⡨⡩⡪⡫⡬⡭⡮⡯⡰⡱⡲⡳⡴⡵⡶⡷⡸⡹⡺⡻⡼⡽⡾⡿⢀⢁⢂⢃⢄⢅⢆⢇⢈⢉⢊⢋⢌⢍⢎⢏⢐⢑⢒⢓⢔⢕⢖⢗⢘⢙⢚⢛⢜⢝⢞⢟⢠⢡⢢⢣⢤⢥⢦⢧⢨⢩⢪⢫⢬⢭⢮⢯⢰⢱⢲⢳⢴⢵⢶⢷⢸⢹⢺⢻⢼⢽⢾⢿⣀⣁⣂⣃⣄⣅⣆⣇⣈⣉⣊⣋⣌⣍⣎⣏⣐⣑⣒⣓⣔⣕⣖⣗⣘⣙⣚⣛⣜⣝⣞⣟⣠⣡⣢⣣⣤⣥⣦⣧⣨⣩⣪⣫⣬⣭⣮⣯⣰⣱⣲⣳⣴⣵⣶⣷⣸⣹⣺⣻⣼⣽⣾⣿",
        "⠁⠂⠃⠄⠅⠆⠇"
      ],
      fontSize: 16,
      fontFamily: "monospace",
      alignToColumns: true,
      correlateScaleSpeed: true,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      minFontSize: 12,
      maxFontSize: 22,
      frameDelay: 50,
    },
    rainGenerator: { density: 1.5 },
  },
  matrix: {
    rainWidth: 10,
    rainHeight: 18,
    minFrameTime: 125,
    syncFrame: false,
    rainGenerator: { density: 0.5 },
    rainDrop: {
      direction: "TD",
      charArrays: ["0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZアァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン"],
      headColor: "rgba(255,255,255,0.8)",
      trailColor: "rgba(62, 225, 78, 1.00)",
      fontSize: 16,
      randomizePosition: true,
      frameDelay: 50,
      minFrameDelay: 50,
      maxFrameDelay: 130,
      randomizeFrameDelay: true,
      randomizeScale: true,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 8,
      maxMoveSpeed: 42,
      correlateScaleSpeed: true,
      jitterLeftStrength: 0,
      jitterRightStrength: 0,
      jitterUpStrength: 0,
      jitterDownStrength: 0,
    },
    trailBloomSize: 8,
    trailBloomColor: "#82ffa9",
    headBloomSize: 4,
    headBloomColor: "#ffffff",
    warmupIterations: 50,
    fadeStrength: 0.05,
  },
  "digital-rain": {
    rainWidth: 10,
    rainHeight: 18,
    minFrameTime: 75,
    rainGenerator: { density: 0.5 },
    rainDrop: {
      direction: "TD",
      charArrays: [
        "⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿⡀⡁⡂⡃⡄⡅⡆⡇⡈⡉⡊⡋⡌⡍⡎⡏⡐⡑⡒⡓⡔⡕⡖⡗⡘⡙⡚⡛⡜⡝⡞⡟⡠⡡⡢⡣⡤⡥⡦⡧⡨⡩⡪⡫⡬⡭⡮⡯⡰⡱⡲⡳⡴⡵⡶⡷⡸⡹⡺⡻⡼⡽⡾⡿⢀⢁⢂⢃⢄⢅⢆⢇⢈⢉⢊⢋⢌⢍⢎⢏⢐⢑⢒⢓⢔⢕⢖⢗⢘⢙⢚⢛⢜⢝⢞⢟⢠⢡⢢⢣⢤⢥⢦⢧⢨⢩⢪⢫⢬⢭⢮⢯⢰⢱⢲⢳⢴⢵⢶⢷⢸⢹⢺⢻⢼⢽⢾⢿⣀⣁⣂⣃⣄⣅⣆⣇⣈⣉⣊⣋⣌⣍⣎⣏⣐⣑⣒⣓⣔⣕⣖⣗⣘⣙⣚⣛⣜⣝⣞⣟⣠⣡⣢⣣⣤⣥⣦⣧⣨⣩⣪⣫⣬⣭⣮⣯⣰⣱⣲⣳⣴⣵⣶⣷⣸⣹⣺⣻⣼⣽⣾⣿",
        "⠁⠂⠃⠄⠅⠆⠇",
        "⣾⣽⣼⣻⣺⣹⣟⢿⢾⣯⣮⣭⡿⡾⡽⢵⡷⡟⠿⡯⡷⡿"
      ],
      headColor: "rgba(255,255,255,0.8)",
      trailColor: "rgba(140,62,225,1.00)",
      fontSize: 16,
      fontFamily: "monospace",
      randomizeScale: false,
      minFontSize: 12,
      maxFontSize: 22,
      moveSpeed: 0,
      minMoveSpeed: 4,
      maxMoveSpeed: 12,
      correlateScaleSpeed: false,
      minFrameDelay: 30,
      maxFrameDelay: 50,
      randomizePosition: true,
      randomizeFrameDelay: true,
    },
    trailBloomSize: 0,
    trailBloomColor: "#ffffff",
    headBloomSize: 0,
    headBloomColor: "#ffffff",
    warmupIterations: 50,
    fadeStrength: 0.05,
  },
};

function getImageStyle(fit: string | undefined): React.CSSProperties {
  switch (fit) {
    case "contain":
      return { objectFit: "contain" as const };
    case "stretch":
      return { objectFit: "fill" as const };
    case "center":
      return { objectFit: "none" as const };
    case "tile":
      return {};
    case "cover":
    default:
      return { objectFit: "cover" as const };
  }
}

function useThemeCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  theme: string,
  enabled: boolean,
) {
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    cancelAnimationFrame(animRef.current);
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    if (theme === "dark-oled") {
      const drawStars = (): void => {
        ctx.clearRect(0, 0, w, h);
        const count = Math.floor((w * h) / 3000);
        for (let i = 0; i < count; i++) {
          ctx.beginPath();
          ctx.arc(
            Math.random() * w,
            Math.random() * h,
            Math.random() * 1.2,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = `rgba(255,255,255,${(0.05 + Math.random() * 0.2).toFixed(2)})`;
          ctx.fill();
        }
      };
      const onResize = (): void => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        drawStars();
      };
      drawStars();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const onResize = (): void => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    if (theme === "glassmorphism") {
      const hues = [200, 220, 240, 260, 280, 300];
      const orbs = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 200 + Math.random() * 200,
        hue: hues[i],
      }));

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        for (const orb of orbs) {
          orb.x += orb.vx;
          orb.y += orb.vy;
          if (orb.x < -orb.r) orb.x = w + orb.r;
          if (orb.x > w + orb.r) orb.x = -orb.r;
          if (orb.y < -orb.r) orb.y = h + orb.r;
          if (orb.y > h + orb.r) orb.y = -orb.r;

          const grd = ctx.createRadialGradient(
            orb.x,
            orb.y,
            0,
            orb.x,
            orb.y,
            orb.r,
          );
          grd.addColorStop(0, `hsla(${orb.hue},80%,60%,0.12)`);
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "neon-cyberpunk") {
      let scanY = 0;
      const CYCLE_FRAMES = 480;

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        scanY = (scanY + h / CYCLE_FRAMES) % h;

        const halo = ctx.createLinearGradient(0, scanY - 10, 0, scanY + 10);
        halo.addColorStop(0, "transparent");
        halo.addColorStop(0.5, "rgba(255,45,120,0.07)");
        halo.addColorStop(1, "transparent");
        ctx.fillStyle = halo;
        ctx.fillRect(0, scanY - 10, w, 20);

        ctx.strokeStyle = "rgba(255,45,120,0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(scanY));
        ctx.lineTo(w, Math.round(scanY));
        ctx.stroke();

        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "synthwave-sunset") {
      const hues = [300, 320, 340, 200, 260, 280];
      const orbs = Array.from({ length: 6 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        r: 150 + Math.random() * 200,
        hue: hues[i],
      }));
      const sunY = h * 0.75;
      const sunR = Math.min(w, h) * 0.15;

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);

        const sunGrad = ctx.createRadialGradient(
          w * 0.5,
          sunY,
          0,
          w * 0.5,
          sunY,
          sunR * 3,
        );
        sunGrad.addColorStop(0, "rgba(255, 150, 80, 0.25)");
        sunGrad.addColorStop(0.4, "rgba(255, 80, 150, 0.1)");
        sunGrad.addColorStop(1, "transparent");
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(w * 0.5, sunY, sunR * 3, 0, Math.PI * 2);
        ctx.fill();

        for (const orb of orbs) {
          orb.x += orb.vx;
          orb.y += orb.vy;
          if (orb.x < -orb.r) orb.x = w + orb.r;
          if (orb.x > w + orb.r) orb.x = -orb.r;
          if (orb.y < -orb.r) orb.y = h + orb.r;
          if (orb.y > h + orb.r) orb.y = -orb.r;

          const grd = ctx.createRadialGradient(
            orb.x,
            orb.y,
            0,
            orb.x,
            orb.y,
            orb.r,
          );
          grd.addColorStop(0, `hsla(${orb.hue},80%,60%,0.12)`);
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
          ctx.fill();
        }

        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "deep-ocean") {
      const bubbles = Array.from({ length: 40 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 3,
        speed: 0.3 + Math.random() * 0.8,
        wobble: Math.random() * Math.PI * 2,
      }));

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        for (const b of bubbles) {
          b.y -= b.speed;
          b.wobble += 0.02;
          if (b.y < -10) {
            b.y = h + 10;
            b.x = Math.random() * w;
          }
          const x = b.x + Math.sin(b.wobble) * 10;
          const grd = ctx.createRadialGradient(x, b.y, 0, x, b.y, b.r * 2);
          grd.addColorStop(0, "rgba(0, 245, 212, 0.5)");
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, b.y, b.r * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "monokai") {
      const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: 1 + Math.random() * 2,
        color:
          Math.random() > 0.5
            ? "rgba(255, 216, 102,"
            : "rgba(120, 220, 232,",
      }));

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h;
          if (p.y > h) p.y = 0;

          ctx.fillStyle = `${p.color} ${0.3 + Math.random() * 0.3})`;
          ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "nord-aurora") {
      let t = 0;
      const bands = [
        { color: "rgba(136, 192, 208,", yOffset: 0, speed: 0.01 },
        { color: "rgba(163, 190, 140,", yOffset: 60, speed: 0.012 },
        { color: "rgba(180, 142, 173,", yOffset: 120, speed: 0.008 },
      ];

      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        t += 1;

        for (const band of bands) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const y =
              h * 0.35 +
              band.yOffset +
              Math.sin(x * 0.003 + t * band.speed) * 40 +
              Math.sin(x * 0.007 + t * band.speed * 1.5) * 20;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, h * 0.3, 0, h);
          grad.addColorStop(0, `${band.color} 0.15)`);
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fill();
        }

        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    } else if (theme === "warm-paper") {
      const draw = (): void => {
        ctx.clearRect(0, 0, w, h);
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "rgba(244, 236, 216, 0.4)");
        grad.addColorStop(0.5, "rgba(235, 228, 209, 0.2)");
        grad.addColorStop(1, "rgba(227, 220, 198, 0.4)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < 500; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          ctx.fillStyle = `rgba(139, 69, 19, ${Math.random() * 0.02})`;
          ctx.fillRect(x, y, 1, 1);
        }
      };
      const onResizeWarm = (): void => {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
        draw();
      };
      draw();
      window.addEventListener("resize", onResizeWarm);
      return () => window.removeEventListener("resize", onResizeWarm);
    } else if (theme === "terminal-tui") {
      // terminal-tui uses the MatrixAnimation in the matrix container
      ctx.clearRect(0, 0, w, h);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [theme, enabled]);
}

function MatrixBackground({ preset }: { preset: MatrixPreset }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<MatrixAnimation | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const rawConfig = MATRIX_PRESETS[preset];
    if (!rawConfig) return;

    // Deep-clone so the library's mutations don't pollute our preset
    const config = JSON.parse(JSON.stringify(rawConfig));

    let created = false;
    let ro: ResizeObserver | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const createAnim = () => {
      if (created || !node) return;
      created = true;
      ro?.disconnect();
      ro = null;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      const anim = new MatrixAnimation(node, config);
      animRef.current = anim;
    };

    if (node.clientWidth > 0 && node.clientHeight > 0) {
      createAnim();
    } else {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0) {
            createAnim();
            return;
          }
        }
      });
      ro.observe(node);

      // Fallback: if ResizeObserver never fires, force creation after a delay.
      timeoutId = setTimeout(() => {
        if (!created) {
          node.style.width = window.innerWidth + "px";
          node.style.height = window.innerHeight + "px";
          createAnim();
        }
      }, 250);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      ro?.disconnect();
      animRef.current?.dispose();
      animRef.current = null;
    };
  }, [preset]);

  return (
    <div
      ref={containerRef}
      className="matrix-animation-bg"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        background: "#000",
      }}
    />
  );
}

function DailyBackground({
  source,
  customUrl,
}: {
  source: DailyBackgroundSource;
  customUrl?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (source === "custom") {
        if (customUrl && !cancelled) setImageUrl(customUrl);
        return;
      }
      if (source === "picsum") {
        if (!cancelled) setImageUrl("https://picsum.photos/1920/1080");
        return;
      }
      if (source === "unsplash") {
        if (!cancelled) setImageUrl("https://source.unsplash.com/random/1920x1080");
        return;
      }
      if (source === "bing") {
        try {
          const res = await fetch(
            "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US",
          );
          const data = await res.json();
          const url = data?.images?.[0]?.url;
          if (url && !cancelled) {
            setImageUrl(`https://www.bing.com${url}`);
            return;
          }
        } catch {
          /* CORS or network failure — fall through to fallback */
        }
        if (!cancelled) setImageUrl("https://picsum.photos/1920/1080");
        return;
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [source, customUrl]);

  if (!imageUrl) return null;
  return <ImageBackground imagePath={imageUrl} imageFit="cover" />;
}

function ImageBackground({
  imagePath,
  imageFit,
}: {
  imagePath: string;
  imageFit?: string;
}) {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    async function load() {
      if (!imagePath) return;
      // HTTP/HTTPS URLs can be used directly
      if (
        imagePath.startsWith("http://") ||
        imagePath.startsWith("https://") ||
        imagePath.startsWith("data:")
      ) {
        if (!cancelled) setSrc(imagePath);
        return;
      }

      // Local file path: read via IPC and create a blob URL
      try {
        const data = await window.htpc.files.read(imagePath);
        if (!data || cancelled) return;
        const blob = new Blob([new Uint8Array(data)]);
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc("");
      }
    }

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imagePath]);

  if (!src) return null;

  const isTile = imageFit === "tile";
  if (isTile) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: `url("${src}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
          backgroundPosition: "center",
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        ...getImageStyle(imageFit),
      }}
    />
  );
}

function BaseBackground({ background }: { background: BackgroundSettings }) {
  if (background.type === "image") {
    if (!background.imagePath) return null;
    return (
      <ImageBackground
        imagePath={background.imagePath}
        imageFit={background.imageFit}
      />
    );
  }

  if (background.type === "solid") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundColor: background.solidColor || "#000000",
        }}
      />
    );
  }

  if (background.type === "gradient") {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: background.gradient || "linear-gradient(#000, #000)",
        }}
      />
    );
  }

  return null;
}

export const ThemeBackground: React.FC = () => {
  const theme = useSettingsStore((s) => s.settings?.theme ?? "dark-oled");
  const background = useSettingsStore(
    (s) => s.settings?.background ?? { type: "theme" as const },
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const useTheme = background.type === "theme";
  const useMatrix = background.type === "matrix-preset";
  const useDaily = background.type === "daily";
  const useCustomBg =
    background.type === "image" ||
    background.type === "solid" ||
    background.type === "gradient";
  const isTerminalTuiTheme = theme === "terminal-tui";

  useThemeCanvas(canvasRef, theme, useTheme);

  let matrixPreset: MatrixPreset | undefined;
  if (useMatrix) {
    matrixPreset = background.matrixPreset ?? "digital-rain";
  } else if (useTheme && isTerminalTuiTheme) {
    matrixPreset = "matrix";
  }

  const showCanvas = useTheme && !isTerminalTuiTheme;

  return (
    <>
      {useCustomBg && <BaseBackground background={background} />}
      {useDaily && (
        <DailyBackground
          source={background.dailySource ?? "bing"}
          customUrl={background.dailyCustomUrl}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          mixBlendMode: useCustomBg ? "overlay" : "normal",
          opacity: showCanvas ? 1 : 0,
        }}
      />
      {matrixPreset && <MatrixBackground preset={matrixPreset} />}
    </>
  );
};
