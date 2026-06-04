import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, X } from "lucide-react";
import {
  Collection,
  CollectionItemType,
  CollectionType,
  SmartFilterGroup,
  SmartFilterRule,
  FilterOperator,
  SortOrder,
  SortDirection,
} from "../../../../shared/types";
import { useCollectionsStore } from "../../store/collections.store";
import { useToastStore } from "../../store/toast.store";

interface CollectionManagerProps {
  open: boolean;
  onClose: () => void;
  itemType: CollectionItemType;
}

const ITEM_TYPE_LABELS: Record<CollectionItemType, string> = {
  game: "Games",
  movie: "Movies",
  music: "Music",
  tv: "TV Shows",
  mixed: "Mixed",
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: "=",
  ne: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  contains: "contains",
  in: "in",
  startsWith: "starts with",
  endsWith: "ends with",
  exists: "exists",
};

const GAME_FIELDS = [
  { field: "title", label: "Title", type: "string" },
  { field: "platform", label: "Platform", type: "string" },
  { field: "genres", label: "Genres", type: "array" },
  { field: "releaseYear", label: "Release Year", type: "number" },
  { field: "developer", label: "Developer", type: "string" },
  { field: "publisher", label: "Publisher", type: "string" },
  { field: "isFavorite", label: "Is Favorite", type: "boolean" },
  { field: "tags", label: "Tags", type: "array" },
  { field: "playTime", label: "Play Time (seconds)", type: "number" },
  { field: "rating", label: "Rating", type: "number" },
  { field: "protonRating", label: "Proton Rating", type: "string" },
];

const MOVIE_FIELDS = [
  { field: "title", label: "Title", type: "string" },
  { field: "genres", label: "Genres", type: "array" },
  { field: "releaseYear", label: "Release Year", type: "number" },
  { field: "director", label: "Director", type: "string" },
  { field: "isFavorite", label: "Is Favorite", type: "boolean" },
  { field: "tags", label: "Tags", type: "array" },
  { field: "rating", label: "Rating", type: "number" },
  { field: "watchProgress", label: "Watch Progress", type: "number" },
];

const MUSIC_FIELDS = [
  { field: "title", label: "Title", type: "string" },
  { field: "artist", label: "Artist", type: "string" },
  { field: "album", label: "Album", type: "string" },
  { field: "genre", label: "Genre", type: "string" },
  { field: "year", label: "Year", type: "number" },
  { field: "isFavorite", label: "Is Favorite", type: "boolean" },
  { field: "tags", label: "Tags", type: "array" },
];

const TV_FIELDS = [
  { field: "title", label: "Title", type: "string" },
  { field: "genres", label: "Genres", type: "array" },
  { field: "firstAirYear", label: "First Air Year", type: "number" },
  { field: "creator", label: "Creator", type: "string" },
  { field: "isFavorite", label: "Is Favorite", type: "boolean" },
  { field: "tags", label: "Tags", type: "array" },
  { field: "rating", label: "Rating", type: "number" },
];

function getFields(itemType: CollectionItemType) {
  switch (itemType) {
    case "game":
      return GAME_FIELDS;
    case "movie":
      return MOVIE_FIELDS;
    case "music":
      return MUSIC_FIELDS;
    case "tv":
      return TV_FIELDS;
    case "mixed":
      return [
        ...GAME_FIELDS,
        ...MOVIE_FIELDS.filter((f) => !GAME_FIELDS.find((g) => g.field === f.field)),
        ...MUSIC_FIELDS.filter((f) => !GAME_FIELDS.find((g) => g.field === f.field) && !MOVIE_FIELDS.find((m) => m.field === f.field)),
        ...TV_FIELDS.filter((f) => !GAME_FIELDS.find((g) => g.field === f.field) && !MOVIE_FIELDS.find((m) => m.field === f.field) && !MUSIC_FIELDS.find((mu) => mu.field === f.field)),
      ];
  }
}

function defaultRule(): SmartFilterRule {
  return { field: "title", operator: "contains", value: "" };
}

function defaultGroup(): SmartFilterGroup {
  return { logic: "and", rules: [defaultRule()] };
}

export const CollectionManager: React.FC<CollectionManagerProps> = ({
  open,
  onClose,
  itemType,
}) => {
  const collections = useCollectionsStore((s) => s.collections);
  const loadCollections = useCollectionsStore((s) => s.load);
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const updateCollection = useCollectionsStore((s) => s.updateCollection);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);

  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<Collection | null>(null);

  const filtered = useMemo(
    () => collections.filter((c) => c.itemType === itemType || c.itemType === "mixed"),
    [collections, itemType],
  );

  const startNew = () => {
    setEditing({
      id: "",
      name: "",
      icon: "",
      color: "",
      description: "",
      itemType,
      type: "manual",
      sortOrder: "title",
      sortDirection: "asc",
      createdAt: 0,
      updatedAt: 0,
    });
    setMode("edit");
  };

  const startEdit = (c: Collection) => {
    setEditing({ ...c });
    setMode("edit");
  };

  const handleSave = async () => {
    if (!editing || !editing.name.trim()) return;
    if (editing.id) {
      await updateCollection(editing);
    } else {
      await createCollection(editing);
    }
    setMode("list");
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    await deleteCollection(id);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex flex-col w-[min(640px,90vw)] max-h-[85vh] rounded-[var(--radius-card)] overflow-hidden"
            style={{
              background: "var(--color-surface-overlay)",
              border: "1px solid var(--color-border)",
            }}
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>
                {mode === "list" ? `${ITEM_TYPE_LABELS[itemType]} Collections` : editing?.id ? "Edit Collection" : "New Collection"}
              </h2>
              <button
                className="p-1 rounded hover:bg-white/10 transition-colors"
                onClick={onClose}
                aria-label="Close"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {mode === "list" ? (
                <div className="flex flex-col gap-3">
                  {filtered.length === 0 ? (
                    <div className="text-center py-8 text-sm" style={{ color: "var(--color-text-dim)" }}>
                      No collections yet.
                    </div>
                  ) : (
                    filtered.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-card)]"
                        style={{
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        {c.icon ? <span className="text-xl">{c.icon}</span> : <Folder size={20} />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate" style={{ color: "var(--color-text)" }}>
                            {c.name}
                          </div>
                          <div className="text-xs truncate" style={{ color: "var(--color-text-dim)" }}>
                            {c.type === "smart" ? "Smart filter" : "Manual"} · {c.itemType}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                            style={{
                              background: "var(--color-surface-overlay)",
                              color: "var(--color-text)",
                              border: "1px solid var(--color-border)",
                            }}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                          <button
                            className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                            style={{
                              background: "var(--color-surface-overlay)",
                              color: "#ff4444",
                              border: "1px solid var(--color-border)",
                            }}
                            onClick={() => handleDelete(c.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    className="mt-2 px-4 py-2.5 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
                    style={{
                      background: "var(--color-accent)",
                      color: "var(--color-bg)",
                    }}
                    onClick={startNew}
                  >
                    + Create Collection
                  </button>
                </div>
              ) : editing ? (
                <CollectionEditForm
                  collection={editing}
                  onChange={setEditing}
                  itemType={itemType}
                />
              ) : null}
            </div>

            {mode === "edit" && editing && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                <button
                  className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
                  style={{
                    background: "var(--color-surface-raised)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() => setMode("list")}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
                  style={{
                    background: "var(--color-accent)",
                    color: "var(--color-bg)",
                  }}
                  onClick={handleSave}
                >
                  Save
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function CollectionEditForm({
  collection,
  onChange,
  itemType,
}: {
  collection: Collection;
  onChange: (c: Collection) => void;
  itemType: CollectionItemType;
}) {
  const fields = useMemo(() => getFields(itemType), [itemType]);

  const update = (partial: Partial<Collection>) => {
    onChange({ ...collection, ...partial });
  };

  const updateFilter = (filter: SmartFilterGroup | undefined) => {
    onChange({ ...collection, filter });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="w-20">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
            Icon
          </label>
          <input
            value={collection.icon ?? ""}
            onChange={(e) => update({ icon: e.target.value })}
            placeholder="Icon"
            className="w-full text-center text-lg px-2 py-1.5 rounded outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
            Name
          </label>
          <input
            value={collection.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Collection name"
            className="w-full text-sm px-3 py-2 rounded outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
          Description
        </label>
        <input
          value={collection.description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Optional description"
          className="w-full text-sm px-3 py-2 rounded outline-none"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
            Type
          </label>
          <select
            value={collection.type}
            onChange={(e) => update({ type: e.target.value as CollectionType })}
            className="w-full text-sm px-3 py-2 rounded outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <option value="manual">Manual</option>
            <option value="smart">Smart Filter</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
            Sort By
          </label>
          <select
            value={collection.sortOrder ?? "title"}
            onChange={(e) => update({ sortOrder: e.target.value as SortOrder })}
            className="w-full text-sm px-3 py-2 rounded outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <option value="title">Title</option>
            <option value="releaseYear">Release Year</option>
            <option value="lastPlayed">Last Played</option>
            <option value="rating">Rating</option>
            <option value="playTime">Play Time</option>
            <option value="added">Date Added</option>
          </select>
        </div>
        <div className="w-24">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-text-dim)" }}>
            Direction
          </label>
          <select
            value={collection.sortDirection ?? "asc"}
            onChange={(e) => update({ sortDirection: e.target.value as SortDirection })}
            className="w-full text-sm px-3 py-2 rounded outline-none"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>
      </div>

      {collection.type === "smart" && (
        <div
          className="rounded-[var(--radius-card)] p-4"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
          }}
        >
          <label className="block text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--color-text-dim)" }}>
            Smart Filter Rules
          </label>
          <AiFilterBuilder
            itemType={itemType}
            onFilterGenerated={updateFilter}
          />
          <div className="my-3 border-t" style={{ borderColor: "var(--color-border)" }} />
          <SmartFilterEditor
            filter={collection.filter ?? defaultGroup()}
            onChange={updateFilter}
            fields={fields}
          />
        </div>
      )}
    </div>
  );
}

function SmartFilterEditor({
  filter,
  onChange,
  fields,
}: {
  filter: SmartFilterGroup;
  onChange: (f: SmartFilterGroup | undefined) => void;
  fields: { field: string; label: string; type: string }[];
}) {
  const updateGroup = (group: SmartFilterGroup) => {
    onChange(group);
  };

  const addRule = () => {
    updateGroup({ ...filter, rules: [...filter.rules, defaultRule()] });
  };

  const removeRule = (index: number) => {
    const next = [...filter.rules];
    next.splice(index, 1);
    if (next.length === 0) next.push(defaultRule());
    updateGroup({ ...filter, rules: next });
  };

  const updateRule = (index: number, rule: SmartFilterRule) => {
    const next = [...filter.rules];
    next[index] = rule;
    updateGroup({ ...filter, rules: next });
  };

  const stringOperators: FilterOperator[] = ["eq", "ne", "contains", "startsWith", "endsWith", "exists"];
  const numberOperators: FilterOperator[] = ["eq", "ne", "gt", "gte", "lt", "lte", "exists"];
  const arrayOperators: FilterOperator[] = ["contains", "in", "exists"];
  const booleanOperators: FilterOperator[] = ["eq", "exists"];

  function getOperatorsForType(type: string): FilterOperator[] {
    switch (type) {
      case "number":
        return numberOperators;
      case "array":
        return arrayOperators;
      case "boolean":
        return booleanOperators;
      default:
        return stringOperators;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <span className="text-xs font-medium" style={{ color: "var(--color-text-dim)" }}>
          Match
        </span>
        <select
          value={filter.logic}
          onChange={(e) => updateGroup({ ...filter, logic: e.target.value as "and" | "or" })}
          className="text-xs px-2 py-1 rounded outline-none"
          style={{
            background: "var(--color-surface-overlay)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        >
          <option value="and">all</option>
          <option value="or">any</option>
        </select>
        <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
          of the following rules
        </span>
      </div>

      {filter.rules.map((rule, i) => {
        if ("logic" in rule) {
          return (
            <div key={i} className="pl-3 border-l-2" style={{ borderColor: "var(--color-accent)" }}>
              <SmartFilterEditor
                filter={rule as SmartFilterGroup}
                onChange={(sub) => {
                  const next = [...filter.rules];
                  next[i] = sub ?? defaultGroup();
                  updateGroup({ ...filter, rules: next });
                }}
                fields={fields}
              />
            </div>
          );
        }
        const r = rule as SmartFilterRule;
        const fieldInfo = fields.find((f) => f.field === r.field);
        const ops = getOperatorsForType(fieldInfo?.type ?? "string");

        return (
          <div key={i} className="flex gap-2 items-center">
            <select
              value={r.field}
              onChange={(e) => updateRule(i, { ...r, field: e.target.value })}
              className="text-xs px-2 py-1.5 rounded outline-none flex-1 min-w-0"
              style={{
                background: "var(--color-surface-overlay)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {fields.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={r.operator}
              onChange={(e) => updateRule(i, { ...r, operator: e.target.value as FilterOperator })}
              className="text-xs px-2 py-1.5 rounded outline-none"
              style={{
                background: "var(--color-surface-overlay)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              {ops.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
            {r.operator !== "exists" && (
              <input
                value={String(r.value ?? "")}
                onChange={(e) => {
                  let val: unknown = e.target.value;
                  if (fieldInfo?.type === "number") val = Number(val) || 0;
                  if (fieldInfo?.type === "boolean") val = val === "true" || val === "1";
                  if (fieldInfo?.type === "array") val = e.target.value.split(",").map((s) => s.trim());
                  updateRule(i, { ...r, value: val });
                }}
                placeholder={fieldInfo?.type === "array" ? "value1, value2" : "value"}
                className="text-xs px-2 py-1.5 rounded outline-none flex-1 min-w-0"
                style={{
                  background: "var(--color-surface-overlay)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            )}
            {r.operator === "exists" && <div className="flex-1" />}
            <button
              className="px-2 py-1 rounded text-xs"
              style={{ color: "#ff4444" }}
              onClick={() => removeRule(i)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      <button
        className="self-start px-3 py-1 rounded-full text-xs font-medium transition-colors"
        style={{
          background: "var(--color-surface-overlay)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
        onClick={addRule}
      >
        + Add rule
      </button>
    </div>
  );
}

function AiFilterBuilder({
  itemType,
  onFilterGenerated,
}: {
  itemType: CollectionItemType;
  onFilterGenerated: (filter: SmartFilterGroup | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    window.htpc.localAi.available().then(setReady).catch(() => setReady(false));
  }, []);

  const handleGenerate = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const filter = await window.htpc.localAi.nlToFilter(query.trim(), itemType);
      if (filter) {
        onFilterGenerated(filter);
        useToastStore.getState().push({
          type: "success",
          message: "AI filter generated successfully",
        });
      } else {
        useToastStore.getState().push({
          type: "error",
          message: "Failed to generate filter from query",
        });
      }
    } catch (err) {
      useToastStore.getState().push({
        type: "error",
        message: String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  if (ready === false) {
    return (
      <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>
        AI model is loading. First use may take a moment while the embedding model downloads.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleGenerate();
          }}
          placeholder="Describe your filter in natural language..."
          className="flex-1 text-xs px-3 py-2 rounded outline-none"
          style={{
            background: "var(--color-surface-overlay)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
        <button
          className="px-3 py-2 rounded text-xs font-medium transition-colors"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            opacity: loading ? 0.6 : 1,
          }}
          onClick={() => void handleGenerate()}
          disabled={loading || !query.trim()}
        >
          {loading ? "..." : "AI Generate"}
        </button>
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>
        Examples: "games released after 2020", "movies with rating above 8", "favorite tracks by Queen"
      </div>
    </div>
  );
}
