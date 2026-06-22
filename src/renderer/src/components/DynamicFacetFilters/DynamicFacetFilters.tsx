import React, { useMemo } from "react";
import { motion } from "framer-motion";

export interface FacetField {
  key: string;
  label: string;
  accessor: (item: unknown) => string | string[] | number | undefined;
  sort?: "asc" | "desc" | "count";
  maxValues?: number;
}

interface DynamicFacetFiltersProps {
  items: unknown[];
  fields: FacetField[];
  activeFilters: Record<string, string | null>;
  onFilter: (field: string, value: string | null) => void;
  className?: string;
}

function extractValues(
  items: unknown[],
  accessor: FacetField["accessor"],
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const raw = accessor(item);
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v !== undefined && v !== null && v !== "") set.add(String(v));
      }
    } else {
      set.add(String(raw));
    }
  }
  return Array.from(set);
}

export function DynamicFacetFilters({
  items,
  fields,
  activeFilters,
  onFilter,
  className,
}: DynamicFacetFiltersProps): React.ReactElement | null {
  const facets = useMemo(() => {
    return fields
      .map((field) => {
        const values = extractValues(items, field.accessor);
        if (values.length === 0) return null;
        const sorted =
          field.sort === "count"
            ? values
            : values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        const limited = field.maxValues ? sorted.slice(0, field.maxValues) : sorted;
        return { field, values: limited, total: values.length };
      })
      .filter(Boolean) as { field: FacetField; values: string[]; total: number }[];
  }, [items, fields]);

  if (facets.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {facets.map(({ field, values, total }) => {
        const active = activeFilters[field.key] ?? null;
        return (
          <div key={field.key} className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
              {field.label}:
            </span>
            <motion.button
              onClick={() => onFilter(field.key, null)}
              className="relative flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors focus:outline-none"
              style={{
                backgroundColor: active === null
                  ? "var(--accent)"
                  : "var(--surface-1)",
                color: active === null ? "var(--surface-base)" : "var(--text-secondary)",
                border: `1px solid ${active === null ? "var(--accent)" : "var(--border-default)"}`,
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              All
            </motion.button>
            {values.map((v) => (
              <motion.button
                key={`${field.key}-${v}`}
                onClick={() => onFilter(field.key, active === v ? null : v)}
                className="relative flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors focus:outline-none"
                style={{
                  backgroundColor: active === v
                    ? "var(--accent)"
                    : "var(--surface-1)",
                  color: active === v ? "var(--surface-base)" : "var(--text-secondary)",
                  border: `1px solid ${active === v ? "var(--accent)" : "var(--border-default)"}`,
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title={v}
              >
                {v}
              </motion.button>
            ))}
            {total > values.length && (
              <span className="text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                +{total - values.length}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
