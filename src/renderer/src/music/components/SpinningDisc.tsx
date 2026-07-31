import React from "react";

export const SpinningDisc: React.FC<{ spinning: boolean; size?: number }> = React.memo(
  ({ spinning, size = 24 }) => {
    const rawId = React.useId();
    const id = rawId.replace(/:/g, "");
    const gradId = `discGrad-${id}`;
    const shineId = `discShine-${id}`;

    return (
      <div
        className={spinning ? "animate-spin" : ""}
        style={{ width: size, height: size, animationDuration: "3s" }}
      >
        <svg viewBox="0 0 48 48" width={size} height={size}>
          <defs>
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2a2a3e" />
              <stop offset="40%" stopColor="#1e2140" />
              <stop offset="100%" stopColor="#08080f" />
            </radialGradient>
            <radialGradient id={shineId} cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <circle cx="24" cy="24" r="23" fill={`url(#${gradId})`} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="24" cy="24" r="16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="24" cy="24" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <circle cx="24" cy="24" r="23" fill={`url(#${shineId})`} />
          <circle cx="24" cy="24" r="5" fill="#050508" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5" />
          <circle cx="24" cy="24" r="1.5" fill="rgba(255,255,255,0.25)" />
        </svg>
      </div>
    );
  }
);
