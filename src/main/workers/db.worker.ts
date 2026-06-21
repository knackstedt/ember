import { parentPort } from "worker_threads";
import { mkdirSync } from "fs";
import { join } from "path";
import { createLogger } from "../util/logger";

const log = createLogger("info");

let db: any = null;
let initDone = false;

interface DbRequest {
  id: number;
  type: "init" | "query";
  dataDir?: string;
  sql?: string;
  params?: Record<string, unknown>;
}

interface DbResponse {
  id: number;
  type: string;
  result?: unknown;
  error?: string;
}

async function initDb(dataDir: string) {
  if (initDone) return;
  const [{ Surreal }, { createNodeEngines }] = await Promise.all([
    import("surrealdb"),
    import("@surrealdb/node"),
  ]);

  mkdirSync(dataDir, { recursive: true });

  db = new Surreal({ engines: createNodeEngines() });
  await db.connect(`surrealkv://${join(dataDir, "htpc.db")}`);
  await db.use({ namespace: "htpc", database: "main" });
  initDone = true;
}

parentPort?.on("message", async (req: DbRequest) => {
  try {
    let result: unknown;
    if (req.type === "init") {
      if (!req.dataDir) throw new Error("Missing dataDir");
      await initDb(req.dataDir);
      result = true;
    } else if (req.type === "query") {
      if (!initDone) throw new Error("DB not initialized");
      if (!req.sql) throw new Error("Missing sql");
      const raw = await db.query(req.sql, req.params);
      // SurrealDB RecordId instances become plain objects after structured
      // clone, so round-trip through JSON to use their toJSON() serializers.
      result = JSON.parse(JSON.stringify(raw));
    } else {
      throw new Error(`Unknown db worker request type: ${(req as any).type}`);
    }
    parentPort?.postMessage({ id: req.id, type: req.type, result } as DbResponse);
  } catch (err) {
    log.error("db-worker", `Request ${req.id} (${req.type}) failed: ${err}`);
    parentPort?.postMessage({
      id: req.id,
      type: req.type,
      error: (err as Error).message,
    } as DbResponse);
  }
});

// Keep the worker alive until explicitly terminated.
parentPort?.postMessage({ type: "ready" });
