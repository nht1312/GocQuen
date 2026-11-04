/**
 * Visual check harness.
 *
 * Drives the real café in headless Chrome over the DevTools protocol: enters as
 * a guest, walks, sits, and captures screenshots. Useful for eyeballing the
 * isometric scene without a desktop session.
 *
 *   node tools/visual-check.mjs [outputDir]
 *
 * Expects the web app on $WEB_URL (default http://localhost:3100) and the API
 * it was built against to be running.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const OUT_DIR = process.argv[2] ?? join(process.cwd(), 'tools', '.shots');
const PORT = 9333;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome or Edge binary found');
  return found;
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async attach(port) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
        const page = targets.find((target) => target.type === 'page');
        if (page) {
          const cdp = new Cdp();
          await cdp.#connect(page.webSocketDebuggerUrl);
          return cdp;
        }
      } catch {
        /* browser still starting */
      }
      await sleep(250);
    }
    throw new Error('Could not attach to the browser');
  }

  #connect(url) {
    return new Promise((resolve, reject) => {
      this.#ws = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
      this.#ws.on('open', resolve);
      this.#ws.on('error', reject);
      this.#ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      });
    });
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  }

  async key(code, key, down) {
    await this.send('Input.dispatchKeyEvent', {
      type: down ? 'keyDown' : 'keyUp',
      code,
      key,
      windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
      nativeVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    });
  }

  async hold(code, key, ms) {
    await this.key(code, key, true);
    await sleep(ms);
    await this.key(code, key, false);
  }

  async click(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    }
  }

  async shot(path) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  close() {
    this.#ws.close();
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--mute-audio',
      '--window-size=1440,900',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(OUT_DIR, 'profile')}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const cdp = await Cdp.attach(PORT);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const logs = [];
  cdp.send('Log.enable');

  // Skip onboarding so the café itself is visible.
  await cdp.send('Page.navigate', { url: WEB_URL });
  await sleep(1500);
  await cdp.shot(join(OUT_DIR, '00-landing.png'));
  await cdp.evaluate(`localStorage.setItem('virtual-cafe.onboarding-complete','true')`);

  await cdp.send('Page.navigate', { url: `${WEB_URL}/cafe` });

  // Wait for the session rather than guessing: a dev build may still be
  // compiling the route when the page first paints.
  let connected = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await sleep(500);
    connected = await cdp.evaluate(
      `Boolean(document.body.innerText.match(/TRONG QUÁN · \\d+\\/\\d+/i))`,
    );
    if (connected) break;
  }
  await sleep(800);
  logs.push(`session ready: ${connected}`);
  await cdp.shot(join(OUT_DIR, '01-arrival.png'));

  // Spawn is at the entrance (2.5, 16.5); the nearest solo table seat is three
  // tiles due east. Holding D and S together walks along the world +x axis.
  await cdp.key('KeyD', 'd', true);
  await cdp.key('KeyS', 's', true);
  await sleep(500);
  await cdp.shot(join(OUT_DIR, '02-walking.png'));
  await sleep(600);
  await cdp.key('KeyD', 'd', false);
  await cdp.key('KeyS', 's', false);
  await sleep(500);
  await cdp.shot(join(OUT_DIR, '03-near-seat.png'));
  logs.push(`prompt visible: ${await cdp.evaluate("document.body.innerText.includes('để ngồi vào')")}`);

  await cdp.hold('KeyE', 'e', 80);
  await sleep(900);
  const seated = await cdp.evaluate(`document.body.innerText.includes('Đứng dậy')`);
  logs.push(`seated after pressing E: ${seated}`);
  await cdp.shot(join(OUT_DIR, '04-seated.png'));

  const errors = await cdp.evaluate(
    `JSON.stringify(window.__cafeErrors ?? [])`,
  );
  logs.push(`page errors: ${errors}`);

  console.log(logs.join('\n'));
  console.log(`screenshots in ${OUT_DIR}`);

  cdp.close();
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
