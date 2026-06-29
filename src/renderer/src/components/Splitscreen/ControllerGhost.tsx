import React from "react";

interface ControllerGhostProps {
  type?: "gamepad" | "keyboard" | "mouse";
  playerNumber: number;
  label?: string;
  locateActive?: boolean;
  size?: number;
}

export const ControllerGhost: React.FC<ControllerGhostProps> = ({
  type = "gamepad",
  playerNumber,
  label,
  locateActive = false,
  size = 48,
}) => {
  return (
    <div
      className={`flex items-center gap-2 ${locateActive ? "animate-pulse" : ""}`}
      style={{
        opacity: locateActive ? 1 : 0.7,
        transition: "opacity 0.3s",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          position: "relative",
          filter: locateActive ? "drop-shadow(0 0 8px var(--accent))" : "none",
          transition: "filter 0.3s",
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {type === "gamepad" && (
            <path
              d="M12 16C8 16 4 20 4 26C4 32 8 36 12 36C14 36 15 35 17 33H31C33 35 34 36 36 36C40 36 44 32 44 26C44 20 40 16 36 16C32 16 30 18 28 20H20C18 18 16 16 12 16Z"
              fill="currentColor"
              opacity="0.3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          )}
          {type === "gamepad" && (
            <>
              <circle cx="14" cy="26" r="2" fill="currentColor" opacity="0.5" />
              <circle cx="34" cy="22" r="2" fill="currentColor" opacity="0.5" />
              <circle cx="38" cy="26" r="2" fill="currentColor" opacity="0.5" />
              <circle cx="30" cy="26" r="2" fill="currentColor" opacity="0.5" />
            </>
          )}
          {type === "keyboard" && (
            <rect
              x="4"
              y="14"
              width="40"
              height="20"
              rx="2"
              fill="currentColor"
              opacity="0.3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          )}
          {type === "keyboard" &&
            Array.from({ length: 3 }).map((_, row) =>
              Array.from({ length: 8 }).map((_, col) => (
                <rect
                  key={`kb-${row}-${col}`}
                  x={7 + col * 4.5}
                  y={17 + row * 5}
                  width="3"
                  height="3"
                  rx="0.5"
                  fill="currentColor"
                  opacity="0.4"
                />
              )),
            )}
          {type === "mouse" && (
            <>
              <ellipse
                cx="24"
                cy="26"
                rx="10"
                ry="14"
                fill="currentColor"
                opacity="0.3"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <line
                x1="24"
                y1="14"
                x2="24"
                y2="24"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.5"
              />
            </>
          )}
        </svg>
      </div>
      <div className="flex flex-col">
        <span
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          P{playerNumber}
        </span>
        {label && (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
