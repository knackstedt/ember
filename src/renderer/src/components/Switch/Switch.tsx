import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  className,
  style,
  id,
}) => {
  return (
    <label
      id={id}
      className={`flex items-center gap-2 cursor-pointer select-none ${className ?? ""}`}
      style={style}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0"
        style={{
          background: checked ? "var(--accent)" : "var(--surface-0)",
          border: "1px solid var(--border-default)",
        }}
      >
        <span
          className="inline-block w-3.5 h-3.5 rounded-full transition-transform"
          style={{
            background: checked ? "var(--surface-base)" : "var(--text-secondary)",
            transform: checked ? "translateX(18px)" : "translateX(2px)",
          }}
        />
      </button>
      {label && (
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
      )}
    </label>
  );
};
