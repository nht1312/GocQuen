#!/usr/bin/env node
/**
 * Frees the dev ports by terminating whatever is listening on them.
 *
 * Why this exists: `npm run dev` starts two long-lived servers (Nest on 4000,
 * Next on 3000) through `concurrently`, each behind a cmd.exe shim on Windows.
 * Closing the terminal — or Ctrl+C that does not propagate through the shim —
 * leaves the grandchild node processes alive and still holding their port, so
 * the next `npm run dev` dies with EADDRINUSE. Run this to clear them.
 *
 * Usage: node tools/free-ports.mjs [--dry-run] [port ...]   (defaults: 3000 4000)
 */
import { execFileSync } from 'node:child_process';

const DEFAULT_PORTS = [3000, 4000];

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run') || argv.includes('-n');
const portArgs = argv.filter((value) => !value.startsWith('-'));

const ports = (portArgs.length ? portArgs : DEFAULT_PORTS)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0 && value < 65536);

if (!ports.length) {
  console.error('No valid ports given.');
  process.exit(1);
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** @returns {number[]} pids listening on `port` */
function listenersOn(port) {
  if (process.platform === 'win32') {
    const output = run('netstat', ['-ano', '-p', 'tcp']);
    const pids = new Set();
    for (const line of output.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      // Proto  Local Address  Foreign Address  State  PID
      if (parts.length < 5 || parts[3] !== 'LISTENING') continue;
      const localPort = Number(parts[1].slice(parts[1].lastIndexOf(':') + 1));
      const pid = Number(parts[4]);
      if (localPort === port && Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  }
  return run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    .split(/\s+/)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function describe(pid) {
  if (process.platform === 'win32') {
    const output = run('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']);
    const name = output.split(',')[0]?.replace(/"/g, '').trim();
    return name && name !== 'INFO' ? name : 'unknown';
  }
  return run('ps', ['-p', String(pid), '-o', 'comm=']).trim() || 'unknown';
}

function isGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    // EPERM means the process exists but is not ours to signal.
    return error.code !== 'EPERM';
  }
}

/** Kills `pid` and waits briefly for the OS to reap it. @returns {boolean} gone */
function kill(pid) {
  if (process.platform === 'win32') {
    // /T so the cmd.exe shim and any watcher children go with it.
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  // Termination is asynchronous; poll briefly instead of reporting a false failure.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (isGone(pid)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  return isGone(pid);
}

let freed = 0;
for (const port of ports) {
  const pids = listenersOn(port);
  if (!pids.length) {
    console.log(`:${port} is free`);
    continue;
  }
  for (const pid of pids) {
    const name = describe(pid);
    if (dryRun) {
      console.log(`:${port} held by pid ${pid} (${name}) - would kill`);
      continue;
    }
    const gone = kill(pid);
    console.log(`:${port} ${gone ? 'freed' : 'kill failed for'} pid ${pid} (${name})`);
    if (gone) freed += 1;
  }
}

if (dryRun) console.log('\nDry run - nothing was killed.');
else if (freed) console.log(`\nFreed ${freed} process${freed === 1 ? '' : 'es'}. You can run \`npm run dev\` now.`);
