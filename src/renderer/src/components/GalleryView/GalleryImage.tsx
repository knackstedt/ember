import React, { useState } from "react";
import { scaledImageUrl } from "../../lib/image-url";
import "./GalleryView.css";

export interface GalleryImageProps {
  src?: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: "eager" | "lazy";
}

export const GalleryImage: React.FC<GalleryImageProps> = React.memo(({
  src,
  alt,
  className,
  style,
  loading = "lazy",
}) => {
  const [failed, setFailed] = useState(false);

  const initials = alt
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`gallery-img-wrapper ${className ?? ""}`}
      data-initials={initials}
      style={style}
    >
      {src && !failed && (
        <img
          src={scaledImageUrl(src, 600, 600)}
          alt={alt}
          className="gallery-img"
          loading={loading}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
});
