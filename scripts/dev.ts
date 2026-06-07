#!/usr/bin/env bun
import { execSync, spawn } from 'child_process';

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

// Start dev server using spawn so we can forward signals and clean up
const child = spawn(
  'electron-vite',
  ['dev', '--', '--no-sandbox', '--disable-setuid-sandbox'],
  { stdio: 'inherit', shell: false }
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
