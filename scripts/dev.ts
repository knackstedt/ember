#!/usr/bin/env bun
import { execSync, spawn } from 'child_process';
import { join } from 'path';

const projectDir = process.cwd();

function killExisting() {
  try {
    // Kill any process using devtools port 9222
    try {
      const lsof = execSync('lsof -ti:9222', { encoding: 'utf-8' });
      const pids = lsof.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        console.log(`Killing process ${pid} on port 9222...`);
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
    } catch (e) {
      // No process on port 9222
    }

    // Kill any process using vite port 5173
    try {
      const lsof = execSync('lsof -ti:5173', { encoding: 'utf-8' });
      const pids = lsof.trim().split('\n').filter(Boolean);
      for (const pid of pids) {
        console.log(`Killing process ${pid} on port 5173...`);
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
    } catch (e) {
      // No process on port 5173
    }

    // Find and kill electron/electron-vite processes from this project
    const processes = execSync('ps aux', { encoding: 'utf-8' });
    const lines = processes.split('\n');

    for (const line of lines) {
      if (line.includes('electron') && (line.includes(projectDir) || line.includes('node_modules/electron'))) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        if (pid && !isNaN(parseInt(pid))) {
          console.log(`Killing electron process ${pid}...`);
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
          } catch (e) {
            // Process might already be dead
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

killExisting();

// Wait a moment for processes to terminate
await new Promise(resolve => setTimeout(resolve, 500));

// Patch built output to fix module-scope app.getPath crashes.
function patchBuiltOutput() {
  try {
    const fs = require('fs');
    const file = join(projectDir, 'out', 'main', 'index.js');
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    const original = content;
    content = content.replace(
      /const movieThumbCache = path\.join\(electron\.app\.getPath\("userData"\), "thumbnails", "movies"\);/g,
      'let movieThumbCache; try { movieThumbCache = path.join(electron.app.getPath("userData"), "thumbnails", "movies"); } catch { movieThumbCache = path.join(process.cwd(), "thumbnails", "movies"); }'
    );
    content = content.replace(
      /const showThumbCache = path\.join\(electron\.app\.getPath\("userData"\), "thumbnails", "tv"\);/g,
      'let showThumbCache; try { showThumbCache = path.join(electron.app.getPath("userData"), "thumbnails", "tv"); } catch { showThumbCache = path.join(process.cwd(), "thumbnails", "tv"); }'
    );
    content = content.replace(
      /const coverRoot = path\.join\(electron\.app\.getPath\("userData"\), "covers", "flash"\);/g,
      'let coverRoot; try { coverRoot = path.join(electron.app.getPath("userData"), "covers", "flash"); } catch { coverRoot = path.join(process.cwd(), "covers", "flash"); }'
    );
    content = content.replace(
      /const PLUGINS_DIR = path\.join\(electron\.app\.getPath\("home"\), "\.config", "htpc", "plugins"\);/g,
      'let PLUGINS_DIR; try { PLUGINS_DIR = path.join(electron.app.getPath("home"), ".config", "htpc", "plugins"); } catch { PLUGINS_DIR = path.join(process.cwd(), "plugins"); }'
    );
    content = content.replace(
      /const PLUGIN_BUILD_DIR = path\.join\(electron\.app\.getPath\("userData"\), "plugin-builds"\);/g,
      'let PLUGIN_BUILD_DIR; try { PLUGIN_BUILD_DIR = path.join(electron.app.getPath("userData"), "plugin-builds"); } catch { PLUGIN_BUILD_DIR = path.join(process.cwd(), "plugin-builds"); }'
    );
    content = content.replace(
      /const statePath = path\.join\(electron\.app\.getPath\("userData"\), "window-state\.json"\);/g,
      'let statePath; try { statePath = path.join(electron.app.getPath("userData"), "window-state.json"); } catch { statePath = path.join(process.cwd(), "window-state.json"); }'
    );
    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log('[dev] Patched out/main/index.js for module-scope app.getPath');
    }
  } catch (e) {
    console.error('[dev] Patch failed:', e);
  }
}

// Watch for rebuilds and patch immediately.
const outMain = join(projectDir, 'out', 'main', 'index.js');
let lastMtime = 0;
setInterval(() => {
  try {
    const fs = require('fs');
    const stats = fs.statSync(outMain);
    if (stats.mtimeMs > lastMtime) {
      lastMtime = stats.mtimeMs;
      patchBuiltOutput();
    }
  } catch { /* file doesn't exist yet */ }
}, 500);

// Start dev server using spawn so we can forward signals and clean up
// Force system libvulkan before Electron's bundled copy so mpv/libplacebo
// can resolve vkCreateXlibSurfaceKHR at load time.
// CRITICAL: unset ELECTRON_RUN_AS_NODE so electron actually runs as Electron
// (not plain Node.js), otherwise electron.app is undefined.
const devEnv = { ...process.env };
delete devEnv.ELECTRON_RUN_AS_NODE;
const ldPath = `/lib/x86_64-linux-gnu${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
const child = spawn(
  'electron-vite',
  ['dev', '--', '--no-sandbox', '--disable-setuid-sandbox'],
  { stdio: 'inherit', shell: false, env: { ...devEnv, LD_LIBRARY_PATH: ldPath } }
);

function shutdown(signal: NodeJS.Signals) {
  child.kill(signal);

  // Give the process tree a moment to die gracefully, then force-kill
  setTimeout(() => {
    child.kill('SIGKILL');
    // Also sweep for any orphaned electron processes from this project
    killExisting();
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Ensure the child exits when the parent exits for any reason
process.on('exit', () => {
  child.kill('SIGKILL');
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
