/**
 * Runs tools/media-check/ in a headless browser and reports what crossed.
 *
 * Kept apart from the socket-level harness because it needs a browser and a
 * configured SFU, neither of which the rest of the check depends on: without
 * Chrome this reports "skipped" rather than failing a run that proved
 * everything else.
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const ROOT = join(process.cwd(), 'tools', 'media-check');
const LIVEKIT_ESM = join(process.cwd(), 'node_modules', 'livekit-client', 'dist', 'livekit-client.esm.mjs');

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

function serve() {
  const server = createServer((request, response) => {
    const path = request.url.split('?')[0];
    const file =
      path === '/livekit-client.esm.mjs'
        ? LIVEKIT_ESM
        : join(ROOT, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    if (!existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    const extension = file.slice(file.lastIndexOf('.'));
    response.writeHead(200, { 'content-type': TYPES[extension] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Attach to the browser this run started, and no other.
 *
 * A fixed debugging port looks tidy until a previous run's browser outlives
 * it — on Windows killing the launcher can leave the real one holding the
 * port, and the next run then drives a stranger's browser and hangs waiting
 * for a page that never loads. Chrome writes the port it actually took into
 * DevToolsActivePort inside its own profile directory, so asking for 0 and
 * reading it back addresses only ours.
 */
async function attach(profile) {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(250);
    if (!existsSync(portFile)) continue;
    // First line is the port; the second is the browser's websocket path.
    const [port] = readFileSync(portFile, 'utf8').trim().split(/\s+/);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* still starting */
    }
  }
  throw new Error('could not attach to the browser');
}

function connect(url) {
  const socket = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
  const pending = new Map();
  let id = 0;
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  return {
    ready,
    send(method, params = {}) {
      id += 1;
      const current = id;
      return new Promise((resolve, reject) => {
        pending.set(current, { resolve, reject });
        socket.send(JSON.stringify({ id: current, method, params }));
      });
    },
    close: () => socket.close(),
  };
}

export async function runMediaCheck({ url, publisherToken, viewerToken, timeoutMs = 60000 }) {
  const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chromePath) return { skipped: 'no Chrome or Edge binary found' };

  const { server, port } = await serve();
  const profile = mkdtempSync(join(tmpdir(), 'cafe-media-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-gpu',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    cdp = connect(await attach(profile));
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(250);
      const ready = await cdp.send('Runtime.evaluate', {
        expression: 'typeof window.run === "function"',
        returnByValue: true,
      });
      if (ready.result?.value) break;
    }

    const expression = `window.run(${JSON.stringify(url)}, ${JSON.stringify(publisherToken)}, ${JSON.stringify(viewerToken)})`;
    const outcome = await Promise.race([
      cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      sleep(timeoutMs).then(() => ({ timedOut: true })),
    ]);
    if (outcome.timedOut) return { error: `timed out after ${timeoutMs}ms` };
    if (outcome.exceptionDetails) return { error: outcome.exceptionDetails.text };
    return outcome.result.value;
  } finally {
    // Close the browser through its own protocol rather than only killing the
    // process we spawned: on Windows that process is a launcher, and a
    // surviving child would go on holding its debugging port and its profile.
    if (cdp) {
      await cdp.send('Browser.close').catch(() => undefined);
      cdp.close();
    }
    chrome.kill();
    server.close();
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a handle; the temp dir is disposable */
    }
  }
}
