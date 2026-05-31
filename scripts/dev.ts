#!/usr/bin/env node
/**
 * Dev supervisor — kills stale Electron processes before startup,
 * watchdogs electron-vite, and nukes the entire tree on exit.
 */
import { spawn, ChildProcess } from 'child_process'
import { readdirSync, readFileSync, readlinkSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const APP_NAME = 'htpc'
const SIGKILL_DELAY_MS = 2000

let child: ChildProcess | null = null
let shutdownTimer: ReturnType<typeof setTimeout> | null = null
let hasShutdown = false

function log(msg: string): void {
  console.log(`[dev-supervisor] ${msg}`)
}

function getProcessCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf-8').replace(/\0/g, ' ')
  } catch {
    return ''
  }
}

function isElectronProcess(pid: number): boolean {
  try {
    const exe = readlinkSync(`/proc/${pid}/exe`)
    return exe.includes('electron')
  } catch {
    return false
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals | number = 'SIGKILL'): void {
  try {
    // First collect all children recursively
    const children = new Set<number>()
    const queue = [pid]

    for (let i = 0; i < queue.length; i++) {
      const parentPid = queue[i]
      try {
        const entries = readdirSync('/proc')
        for (const entry of entries) {
          const childPid = parseInt(entry, 10)
          if (isNaN(childPid)) continue
          try {
            const stat = readFileSync(`/proc/${childPid}/stat`, 'utf-8')
            // Extract ppid from stat: format is "pid (comm) state ppid ..."
            const match = stat.match(/^\d+\s+\([^)]*\)\s+\S+\s+(\d+)/)
            if (match && parseInt(match[1], 10) === parentPid) {
              if (!children.has(childPid)) {
                children.add(childPid)
                queue.push(childPid)
              }
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }

    // Kill children first (bottom-up), then parent
    for (const cpid of [...children].reverse()) {
      try {
        process.kill(cpid, signal)
      } catch {
        // ignore
      }
    }
    try {
      process.kill(pid, signal)
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

function killStaleElectronProcesses(): void {
  log('Scanning for stale Electron processes...')
  let killed = 0

  try {
    const entries = readdirSync('/proc')
    for (const entry of entries) {
      const pid = parseInt(entry, 10)
      if (isNaN(pid) || pid === process.pid) continue

      if (!isElectronProcess(pid)) continue

      const cmdline = getProcessCmdline(pid)
      // Match processes running our app's entry point or out/main path
      const isOurApp =
        cmdline.includes(APP_NAME) ||
        cmdline.includes('out/main') ||
        cmdline.includes('src/main') ||
        cmdline.includes(join(PROJECT_ROOT, 'out'))

      if (isOurApp) {
        log(`Killing stale Electron PID ${pid}: ${cmdline.slice(0, 120)}`)
        killProcessTree(pid, 'SIGTERM')
        // Give it a moment, then SIGKILL
        setTimeout(() => killProcessTree(pid, 'SIGKILL'), 500)
        killed++
      }
    }
  } catch (err) {
    log(`Error scanning procs: ${err}`)
  }

  if (killed > 0) {
    log(`Sent kill signals to ${killed} stale process(es)`)
  } else {
    log('No stale Electron processes found')
  }
}

function shutdown(exitCode = 0): void {
  if (hasShutdown) return
  hasShutdown = true

  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }

  if (child && child.pid && !child.killed) {
    log('Shutting down child process tree...')
    killProcessTree(child.pid, 'SIGKILL')
    shutdownTimer = setTimeout(() => {
      log('Forcing supervisor exit')
      process.exit(exitCode)
    }, SIGKILL_DELAY_MS + 500)
  } else {
    process.exit(exitCode)
  }
}

async function startDev(): Promise<void> {
  if (hasShutdown) return

  killStaleElectronProcesses()

  log('Starting electron-vite dev...')
  const newChild = spawn('bun', ['x', 'electron-vite', 'dev', '--', '--disable-gpu', '--in-process-gpu', '--no-sandbox', '--disable-setuid-sandbox'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      NODE_ENV: 'development',
      NO_SANDBOX: '1'
    }
  })
  child = newChild

  newChild.on('spawn', () => {
    log(`Child spawned (pid=${newChild.pid})`)
  })

  newChild.on('error', (err) => {
    log(`Child error: ${err.message}`)
    shutdown(1)
  })

  newChild.on('close', (code) => {
    // Ignore close events from stale children that we're replacing
    if (child !== newChild) return
    log(`Child exited with code ${code}`)
    child = null
    process.exit(code ?? 0)
  })
}

// Signal handlers
process.on('SIGINT', () => {
  log('SIGINT received')
  shutdown(0)
})

process.on('SIGTERM', () => {
  log('SIGTERM received')
  shutdown(0)
})

process.on('exit', () => {
  if (child && !child.killed && child.pid) {
    killProcessTree(child.pid, 'SIGKILL')
  }
})

// Also catch uncaught errors
process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.message}`)
  shutdown(1)
})

startDev().catch((err) => {
  log(`Fatal: ${err.message}`)
  shutdown(1)
})
