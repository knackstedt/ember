import React, { useState } from "react";
import { scaledImageUrl } from "../../lib/image-url";

export interface BookshelfSpineProps {
  coverUrl?: string;
  title: string;
  subtitle?: string;
  isHovered: boolean;
  isFocused: boolean;
}

export const BookshelfSpine: React.FC<BookshelfSpineProps> = React.memo(({
  coverUrl,
  title,
  subtitle,
  isHovered,
  isFocused,
}) => {
  const [failed, setFailed] = useState(false);
  const hasCover = coverUrl && !failed;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Background gradient or blurred cover */}
      <div
        className="absolute inset-0"
        style={{
          background: hasCover ? undefined : "linear-gradient(180deg, #1a1a2e, #0f0f1e)",
        }}
      >
        {hasCover && (
          <img
            src={scaledImageUrl(coverUrl, 200, 600)}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
            style={{
              filter: isHovered ? undefined : "blur(8px) brightness(0.55)",
              transform: isHovered ? undefined : "scale(1.15)",
            }}
          />
        )}
      </div>

      {/* Fallback initials when no cover */}
      {!hasCover && !isHovered && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[14px] font-bold text-white/35 tracking-wide">
            {title
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("")}
          </span>
        </div>
      )}

      {/* Collapsed title */}
      {!isHovered && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: hasCover
              ? "linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.55))"
              : undefined,
          }}
        >
          <span
            className="text-[12px] font-bold text-white/80 tracking-wide"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: "rotate(180deg)",
              maxHeight: "85%",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
          >
            {title}
          </span>
        </div>
      )}

      {/* Expanded info */}
      {isHovered && (
        <div
          className="absolute bottom-0 left-0 right-0 p-2"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.92), transparent)",
          }}
        >
          <div className="text-[12px] font-bold text-white truncate">{title}</div>
          {subtitle && (
            <div className="text-[12px] text-white/50 truncate">{subtitle}</div>
          )}
        </div>
      )}

      {/* Focus outline */}
      {isFocused && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: "inset 0 0 0 2px var(--accent)",
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
});
