// @ts-ignore @dotglitch/odatav4 is ESM-only; Node 20.19+ supports require(esm) at runtime
import { createQuery, SQLLang, renderQuery } from "@dotglitch/odatav4";
import { getDb } from "../db";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export interface QueryResult<T = any> {
  results: T[];
  count?: number;
}

function extractRecordId(raw: unknown): string {
  if (typeof raw === "string") {
    const colonIdx = raw.indexOf(":");
    if (colonIdx >= 0) {
      let id = raw.slice(colonIdx + 1);
      if (id.startsWith("⟨") && id.endsWith("⟩")) {
        id = id.slice(1, -1);
      }
      return id;
    }
    return raw;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.id === "string") return extractRecordId(obj.id);
    if (typeof obj.id === "object" && obj.id !== null) {
      return extractRecordId(obj.id);
    }
    const str = String(raw);
    const colonIdx = str.indexOf(":");
    if (colonIdx >= 0) {
      let id = str.slice(colonIdx + 1);
      if (id.startsWith("⟨") && id.endsWith("⟩")) {
        id = id.slice(1, -1);
      }
      return id;
    }
    return str;
  }
  return String(raw);
}

export async function executeODataQuery<T = any>(
  table: string,
  odataQuery: string,
): Promise<QueryResult<T>> {
  const db = getDb();

  try {
    const parsed = createQuery(odataQuery, { type: SQLLang.SurrealDB });
    const { countQuery, entriesQuery, parameters } = renderQuery(parsed, table);

    // SurrealDB JS SDK expects parameter keys without $ prefix
    const surrealParams: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parameters)) {
      surrealParams[key.replace(/^\$/, "")] = value;
    }

    // Execute count query if present
    let count: number | undefined;
    if (countQuery && String(countQuery).trim()) {
      try {
        const countResult = await db.query<[any[]]>(String(countQuery), surrealParams);
        const countRows = (countResult[0] ?? []) as any[];
        if (countRows.length > 0 && typeof countRows[0].count === "number") {
          count = countRows[0].count;
        } else if (countRows.length > 0 && typeof countRows[0]["count()"] === "number") {
          count = countRows[0]["count()"];
        }
      } catch (countErr) {
        log.warn("query", `Count query failed for ${table}: ${countErr}`);
      }
    }

    // Execute entries query
    const result = await db.query<[T[]]>(String(entriesQuery), surrealParams);
    const rows = (result[0] ?? []) as T[];

    // Normalize record IDs
    const normalized = rows.map((row: any) => ({
      ...row,
      id: extractRecordId(row.id),
    }));

    return { results: normalized as T[], count };
  } catch (err) {
    log.error("query", `OData query failed for ${table}: ${odataQuery}: ${err}`);
    throw err;
  }
}
