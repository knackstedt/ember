import { spawn, spawnSync } from "child_process";
import { Game, SessionHook, SessionHookTiming } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

const DEFAULT_TIMEOUT = 30000;

function runHook(hook: SessionHook, env: NodeJS.ProcessEnv): Promise<{ ok: boolean; code?: number; signal?: string; error?: string }> {
  return new Promise((resolve) => {
    const timeoutMs = hook.timeout ?? DEFAULT_TIMEOUT;
    const cmd = hook.command;
    const args = hook.args ?? [];
    const cwd = hook.workingDir || undefined;
    const mergedEnv = { ...env, ...hook.env };

    log.info("session-hooks", `Running [${hook.timing}]: ${cmd} ${args.join(" ")} (timeout: ${timeoutMs}ms)`);

    const proc = spawn(cmd, args, {
      detached: false,
      stdio: "pipe",
      env: mergedEnv,
      cwd,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      log.warn("session-hooks", `Hook [${hook.timing}] timed out after ${timeoutMs}ms: ${cmd}`);
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 2000);
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      log.error("session-hooks", `Hook [${hook.timing}] failed to spawn: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });

    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        log.info("session-hooks", `Hook [${hook.timing}] completed: ${cmd}`);
        resolve({ ok: true, code: 0 });
      } else {
        const reason = signal ? `killed by ${signal}` : `exited with code ${code}`;
        log.warn("session-hooks", `Hook [${hook.timing}] ${reason}: ${cmd}`);
        resolve({ ok: false, code: code ?? undefined, signal: signal ?? undefined });
      }
    });
  });
}

function runHookSync(hook: SessionHook, env: NodeJS.ProcessEnv): { ok: boolean; code?: number; signal?: string; error?: string } {
  const timeoutMs = hook.timeout ?? DEFAULT_TIMEOUT;
  const cmd = hook.command;
  const args = hook.args ?? [];
  const cwd = hook.workingDir || undefined;
  const mergedEnv = { ...env, ...hook.env };

  log.info("session-hooks", `Running blocking [${hook.timing}]: ${cmd} ${args.join(" ")} (timeout: ${timeoutMs}ms)`);

  try {
    const result = spawnSync(cmd, args, {
      stdio: "pipe",
      env: mergedEnv,
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
    });

    if (result.error) {
      log.error("session-hooks", `Blocking hook [${hook.timing}] failed: ${result.error.message}`);
      return { ok: false, error: result.error.message };
    }

    if (result.signal) {
      log.warn("session-hooks", `Blocking hook [${hook.timing}] killed by ${result.signal}: ${cmd}`);
      return { ok: false, signal: result.signal };
    }

    if (result.status !== 0) {
      log.warn("session-hooks", `Blocking hook [${hook.timing}] exited with code ${result.status}: ${cmd}`);
      return { ok: false, code: result.status ?? undefined };
    }

    log.info("session-hooks", `Blocking hook [${hook.timing}] completed: ${cmd}`);
    return { ok: true, code: 0 };
  } catch (err: any) {
    log.error("session-hooks", `Blocking hook [${hook.timing}] exception: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function runSessionHooks(
  game: Game,
  timing: SessionHookTiming,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const hooks = game.sessionHooks?.filter((h) => h.timing === timing) ?? [];
  if (hooks.length === 0) return;

  for (const hook of hooks) {
    if (timing === "before-start-blocking") {
      const result = runHookSync(hook, baseEnv);
      if (!result.ok) {
        log.warn("session-hooks", `Blocking hook failed for "${game.title}", continuing launch anyway`);
      }
    } else {
      // Fire-and-forget for non-blocking hooks
      void runHook(hook, baseEnv).then((result) => {
        if (!result.ok) {
          log.warn("session-hooks", `Non-blocking hook [${timing}] failed for "${game.title}"`);
        }
      });
    }
  }
}
