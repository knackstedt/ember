#!/usr/bin/env bun
import { execSync } from 'child_process';

const projectDir = process.cwd();

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
  
  // Wait a moment for processes to terminate
  await new Promise(resolve => setTimeout(resolve, 500));
} catch (e) {
  // Ignore errors
}

// Start dev server
execSync('electron-vite dev -- --no-sandbox --disable-setuid-sandbox', { stdio: 'inherit' });
