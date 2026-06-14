import React from "react";

export const PSXIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({ size = 12, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <path
      d="M4 4 L12 12 M12 4 L4 12"
      stroke={color ?? "currentColor"}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const PSCircleIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({ size = 12, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <circle cx="8" cy="8" r="5.5" stroke={color ?? "currentColor"} strokeWidth="1.5" />
  </svg>
);

export const PSSquareIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({ size = 12, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <rect
      x="2.5"
      y="2.5"
      width="11"
      height="11"
      rx="1"
      stroke={color ?? "currentColor"}
      strokeWidth="1.5"
    />
  </svg>
);

export const PSTriangleIcon: React.FC<{ size?: number; color?: string; className?: string }> = ({ size = 12, color, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <path
      d="M8 3 L13.5 13.5 L2.5 13.5 Z"
      stroke={color ?? "currentColor"}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);
