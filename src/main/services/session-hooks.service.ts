import { spawn, spawnSync } from "child_process";
import { Game, SessionHook, SessionHookTiming } from "../../shared/types";
import { createLogger } from "../util/logger";
import { getMainWindow } from "../index";

const log = createLogger("info");

const DEFAULT_TIMEOUT = 30000;
const MAX_HOOK_TIMEOUT = 600000;
const MAX_HOOK_OUTPUT = 4096;

function hookTimeout(hook: SessionHook): number {
  const raw = hook.timeout ?? DEFAULT_TIMEOUT;
  return Math.max(0, Math.min(raw, MAX_HOOK_TIMEOUT));
}

function validateHook(hook: SessionHook): string | null {
  if (!hook.command || hook.command.trim().length === 0) {
    return "Hook command is empty";
  }
  return null;
}

function runHook(hook: SessionHook, env: NodeJS.ProcessEnv): Promise<{ ok: boolean; code?: number; signal?: string; error?: string }> {
  return new Promise((resolve) => {
    const validation = validateHook(hook);
    if (validation) {
      log.error("session-hooks", validation);
      resolve({ ok: false, error: validation });
      return;
    }
    const timeoutMs = hookTimeout(hook);
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

    let stdoutLen = 0;
    let stderrLen = 0;

    proc.stdout?.on("data", (data: Buffer) => {
      stdoutLen += data.length;
      if (stdoutLen <= MAX_HOOK_OUTPUT) {
        log.info("session-hooks", `[stdout] ${data.toString().trimEnd()}`);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderrLen += data.length;
      if (stderrLen <= MAX_HOOK_OUTPUT) {
        log.warn("session-hooks", `[stderr] ${data.toString().trimEnd()}`);
      }
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
  const validation = validateHook(hook);
  if (validation) {
    log.error("session-hooks", validation);
    return { ok: false, error: validation };
  }
  const timeoutMs = hookTimeout(hook);
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

function notifyHookError(gameTitle: string, timing: string, reason: string) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("session-hook:error", { gameTitle, timing, reason });
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
        const reason = result.error ?? (result.code !== undefined ? `exited with code ${result.code}` : `killed by ${result.signal}`);
        notifyHookError(game.title, timing, reason);
        throw new Error(`Blocking hook failed for "${game.title}": ${reason}`);
      }
    } else {
      // Fire-and-forget for non-blocking hooks
      void runHook(hook, baseEnv).then((result) => {
        if (!result.ok) {
          const reason = result.error ?? (result.code !== undefined ? `exited with code ${result.code}` : `killed by ${result.signal}`);
          log.warn("session-hooks", `Non-blocking hook [${timing}] failed for "${game.title}": ${reason}`);
          notifyHookError(game.title, timing, reason);
        }
      });
    }
  }
}
