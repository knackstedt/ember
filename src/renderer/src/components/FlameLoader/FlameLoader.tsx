import React, { useEffect, useId, useRef } from "react";

const FIRE = ["#cc1100", "#ff2200", "#ff4500", "#ff6600", "#ff8c00", "#ffb300", "#ffe055"];
const RC = "#ff4500";
const AM = "#ff8c00";
const PI2 = Math.PI * 2;

export interface FlameLoaderProps {
    width?: number;
    height?: number;
    innerRadius?: number;
    outerRadius?: number;
    burstCount?: number;
    burstInterval?: number;
    trickle?: number;
    speed?: number;
    size?: number;
    lifetime?: number;
    centering?: number;
    glow?: number;
    fpsCap?: number;
    animSpeed?: number;
    className?: string;
    style?: React.CSSProperties;
}

export const FlameLoader: React.FC<FlameLoaderProps> = ({
    width = 190,
    height = 310,
    innerRadius = 40,
    outerRadius = 48,
    burstCount = 18,
    burstInterval = 2,
    trickle = 7,
    speed = 1,
    size = 1,
    lifetime = 2,
    centering = 1,
    glow = 5,
    fpsCap = 60,
    animSpeed = 1,
    className,
    style,
}) => {
    const pCanvasRef = useRef<HTMLCanvasElement>(null);
    const rCanvasRef = useRef<HTMLCanvasElement>(null);
    const uid = useId();
    const gooId = `${uid}-goo`;

    useEffect(() => {
        const pCanvas = pCanvasRef.current;
        const rCanvas = rCanvasRef.current;
        if (!pCanvas || !rCanvas) return;

        const pCtx = pCanvas.getContext("2d")!;
        const rCtx = rCanvas.getContext("2d")!;
        if (!pCtx || !rCtx) return;

        const CX = width / 2;
        const CY = height * 0.677;
        const MAX_PTS = 800;

        interface Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            life: number;
            dec: number;
            sz: number;
            ci: number;
        }

        const pts: Particle[] = [];

        function drawRing(g: CanvasRenderingContext2D, t: number) {
            const R = (innerRadius + outerRadius) / 2;
            const sw = outerRadius - innerRadius;
            g.lineWidth = sw;
            g.strokeStyle = RC;
            g.beginPath();
            g.arc(CX, CY, R, 0, PI2);
            g.stroke();

            const bR = sw * 0.46;
            const wb = sw * 0.3;
            [0.62, 1.01, 0.44, 0.82, 1.22, 0.54].forEach((s, i) => {
                const a = t * s + i * 1.047;
                const rr = R + Math.sin(t * 2.4 + i * 1.3) * wb;
                g.beginPath();
                g.arc(
                    CX + Math.cos(a) * rr,
                    CY + Math.sin(a) * rr,
                    Math.max(bR + Math.sin(t * 1.9 + i * 0.85) * wb * 0.4, 1.2),
                    0,
                    PI2
                );
                g.fillStyle = i % 2 ? AM : RC;
                g.fill();
            });

            const cr = sw * 0.18 + Math.sin(t * 2.4) * sw * 0.07;
            g.beginPath();
            g.arc(CX, CY, Math.max(cr, 1), 0, PI2);
            g.fillStyle = AM;
            g.fill();
        }

        function spawn() {
            if (pts.length >= MAX_PTS) return;
            const angle = ((Math.random() + Math.random()) / 2) * Math.PI;
            const R = (innerRadius + outerRadius) / 2;
            const sw = outerRadius - innerRadius;
            const r = R + (Math.random() - 0.5) * sw * 0.4;
            const heat = Math.sin(angle);
            const ciBase = Math.round(heat * 3.5);
            pts.push({
                x: CX + Math.cos(angle) * r,
                y: CY + Math.sin(angle) * r,
                vx: Math.cos(angle) * (0.18 + Math.random() * 0.25) + (Math.random() - 0.5) * 0.04,
                vy: -(0.26 + Math.random() * 0.40) * speed,
                life: 1,
                dec: (0.0009 + Math.random() * 0.0012 + (1 - heat) * 0.003) / lifetime,
                sz: 1.5 + Math.random() * 3 + heat * 1.8,
                ci: Math.min(ciBase + Math.floor(Math.random() * (7 - ciBase)), 6),
            });
        }

        function drawP(q: Particle) {
            const rt = CY - outerRadius;
            let sz = q.sz * q.life * size;
            if (q.y < rt) {
                const hF = Math.min((rt - q.y) / 130, 1);
                const dxF = Math.min(Math.abs(q.x - CX) / (outerRadius * 1.1), 1);
                sz *= 1 - hF * (1 - dxF);
            }
            sz = Math.max(sz, 0.08);
            pCtx.save();
            pCtx.globalAlpha = Math.min(q.life * 1.45, 0.9);
            pCtx.shadowBlur = glow;
            pCtx.shadowColor = pCtx.fillStyle = FIRE[q.ci];
            pCtx.beginPath();
            pCtx.arc(q.x, q.y, sz, 0, PI2);
            pCtx.fill();
            pCtx.restore();
        }

        let simTime = 0;
        let burstAccum = 0;
        let lastTime = performance.now();
        let rafId: number;

        function simulate(dt: number) {
            const dtF = Math.max(0.01, dt * animSpeed * 60);
            simTime += dt * animSpeed;

            burstAccum += dt * animSpeed;
            while (burstAccum >= burstInterval) {
                burstAccum -= burstInterval;
                for (let k = 0; k < burstCount; k++) spawn();
            }
            if (Math.random() < trickle * dt * animSpeed) spawn();

            const rt = CY - outerRadius;
            const vyD = Math.pow(0.9985, dtF);
            const vxD = Math.pow(0.97, dtF);

            for (let i = pts.length - 1; i >= 0; i--) {
                const q = pts[i];
                q.vy *= vyD;
                q.y += q.vy * dtF;

                const ab = Math.max(0, rt - q.y);
                const hR = Math.min(ab / 75, 1);
                q.vx += (CX - q.x) * 0.00016 * centering * hR * dtF;
                q.vx += (Math.random() - 0.5) * 0.003 * dtF;
                q.vx *= vxD;
                q.x += q.vx * dtF;

                q.life -= q.dec * dtF;
                if (q.life <= 0) {
                    pts.splice(i, 1);
                }
            }
        }

        function render() {
            rCtx.clearRect(0, 0, width, height);
            drawRing(rCtx, simTime);

            pCtx.clearRect(0, 0, width, height);
            for (let i = 0; i < pts.length; i++) {
                drawP(pts[i]);
            }
        }

        // Warm up: simulate 10 seconds of animation at 60 fps before first draw
        const WARMUP_STEPS = 10 * 60;
        const WARMUP_DT = 1 / 60;
        for (let s = 0; s < WARMUP_STEPS; s++) {
            simulate(WARMUP_DT);
        }

        function loop(ts: number) {
            rafId = requestAnimationFrame(loop);
            const elapsed = ts - lastTime;
            if (elapsed < 1000 / fpsCap - 0.5) return;
            const dt = Math.min(elapsed / 1000, 0.1);
            lastTime = ts;
            simulate(dt);
            render();
        }

        rafId = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(rafId);
        };
    }, [
        width,
        height,
        innerRadius,
        outerRadius,
        burstCount,
        burstInterval,
        trickle,
        speed,
        size,
        lifetime,
        centering,
        glow,
        fpsCap,
        animSpeed,
    ]);

    return (
        <div
            className={className}
            style={{
                position: "relative",
                width,
                height,
                ...style,
            }}
        >
            <canvas
                ref={pCanvasRef}
                width={width}
                height={height}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 1,
                }}
            />
            <canvas
                ref={rCanvasRef}
                width={width}
                height={height}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    zIndex: 2,
                    filter: `url(#${gooId}) drop-shadow(0 0 8px #ff4400) drop-shadow(0 0 20px rgba(255,68,0,.34))`,
                }}
            />
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
                <defs>
                    <filter id={gooId} x="-55%" y="-55%" width="210%" height="210%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
                        <feColorMatrix
                            in="b"
                            mode="matrix"
                            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 25 -10"
                        />
                    </filter>
                </defs>
            </svg>
        </div>
    );
};

export default FlameLoader;
