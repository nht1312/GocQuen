/**
 * Mobile visual check.
 *
 * The desktop sibling of this script (visual-check.mjs) drives the café with a
 * keyboard and a mouse, which is exactly the input a phone does not have. This
 * one emulates a phone — device pixel ratio, touch events, no keyboard — and
 * walks across the room with the on-screen joystick, sits down with the action
 * button, and opens each tab of the dock, capturing a screenshot at every step
 * (SPEC 10.3).
 *
 *   node tools/mobile-check.mjs [outputDir]
 *
 * Expects the web app on $WEB_URL (default http://localhost:3000) and the API
 * it was built against to be running.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const OUT_DIR = process.argv[2] ?? join(process.cwd(), 'tools', '.shots-mobile');
const PORT = 9334;

/** A mid-range phone held upright, and the same phone turned sideways. */
const PORTRAIT = { width: 390, height: 844, deviceScaleFactor: 3 };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 3 };

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

  /**
   * Every call is bounded. A dropped DevTools response is rare but it does
   * happen, and without a deadline the whole run simply stops with no output
   * and no clue which step it died on.
   */
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} did not answer within ${timeoutMs}ms`));
      }, timeoutMs);
      const settle = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      this.#pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
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

  /** Put the page into phone mode: size, pixel ratio, touch, no mouse. */
  async emulate({ width, height, deviceScaleFactor }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: true,
      screenOrientation: {
        type: width > height ? 'landscapePrimary' : 'portraitPrimary',
        angle: width > height ? 90 : 0,
      },
    });
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await this.send('Emulation.setEmitTouchEventsForMouse', {
      enabled: true,
      configuration: 'mobile',
    });
  }

  async touch(type, points) {
    await this.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  }

  async tap(x, y) {
    await this.touch('touchStart', [{ x, y }]);
    await sleep(60);
    await this.touch('touchEnd', []);
  }

  /**
   * Hold the joystick at an offset from its centre for a while, the way a
   * thumb does: one touchStart, a stream of touchMoves, one touchEnd.
   */
  async drag(from, to, ms) {
    await this.touch('touchStart', [{ x: from.x, y: from.y }]);
    await this.touch('touchMove', [{ x: to.x, y: to.y }]);
    const steps = Math.max(1, Math.round(ms / 50));
    for (let i = 0; i < steps; i += 1) {
      // Keep the finger reported as present; the engine reads the ref every
      // frame, so holding still is just not moving it.
      await this.touch('touchMove', [{ x: to.x, y: to.y }]);
      await sleep(50);
    }
    await this.touch('touchEnd', []);
  }

  async box(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })()`);
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

/**
 * Does anything stick out past the edge of the viewport? On a phone this is
 * the difference between a usable café and one you can only see half of.
 */
const OVERFLOW_PROBE = `(() => {
  const width = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > width + 1 || r.left < -1) {
      bad.push(el.tagName.toLowerCase() + '.' + (el.className?.toString?.().slice(0, 40) ?? '') +
        ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
  }
  return { width, scrollWidth: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
})()`;

/** Every control a thumb is meant to hit, with the size it was given. */
const TAP_TARGET_PROBE = `(() => {
  const small = [];
  for (const el of document.querySelectorAll('button, select, a, input[type=checkbox]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 36 || r.width < 24) {
      small.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 36) +
        ' = ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }
  return small;
})()`;

async function main() {
  // A fresh profile every run. The browser's localStorage holds the café
  // session, so a reused profile reconnects to the previous run's seat and
  // the walk then starts from a chair instead of from the door.
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const chrome = spawn(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
    // Software WebGL, so the 3D café (NEXT_PUBLIC_RENDERER=3d) renders headless.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--no-first-run',
      '--mute-audio',
      '--window-size=390,844',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${join(OUT_DIR, 'profile')}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const cdp = await Cdp.attach(PORT);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.emulate(PORTRAIT);

  const logs = [];
  const note = (line) => {
    logs.push(line);
    console.log(line);
  };

  await cdp.send('Page.navigate', { url: WEB_URL });
  await sleep(2500);
  await cdp.shot(join(OUT_DIR, '00-landing.png'));
  note(`landing overflow: ${JSON.stringify(await cdp.evaluate(OVERFLOW_PROBE))}`);

  // Enter by touch alone: type into the name field, tap the button.
  await cdp.evaluate(`localStorage.setItem('virtual-cafe.onboarding-complete','true')`);
  const field = await cdp.box('#display-name');
  if (field) await cdp.tap(field.cx, field.cy);
  await cdp.evaluate(`(() => {
    const input = document.querySelector('#display-name');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Thu Hà');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(300);
  await cdp.shot(join(OUT_DIR, '01-name-typed.png'));

  const enter = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Vào quán'));
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, h: r.height };
  })()`);
  note(`enter button: ${JSON.stringify(enter)}`);
  if (enter) await cdp.tap(enter.cx, enter.cy);

  // A cold `next dev` compiles /cafe on this first request, which can take
  // longer than the session does to connect; wait for the route, then for the
  // room.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(500);
    if ((await cdp.evaluate('location.pathname')) === '/cafe') break;
  }
  let connected = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(500);
    connected = await cdp.evaluate(
      `Boolean(document.querySelector('nav[aria-label="Bảng điều khiển quán"]'))`,
    );
    if (connected) break;
  }
  await sleep(1500);

  // `next dev` parks its indicator in the bottom-left corner, exactly over the
  // first tab of the dock. It does not exist in a production build, so it is
  // hidden here rather than designed around — with a stylesheet, not by
  // removing the node, which Next puts straight back.
  await cdp.evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = 'nextjs-portal { display: none !important }';
    document.head.appendChild(style);
  })()`);

  note(`café reached by touch: ${connected}`);
  await cdp.shot(join(OUT_DIR, '02-arrival.png'));
  note(`café overflow: ${JSON.stringify(await cdp.evaluate(OVERFLOW_PROBE))}`);
  note(`small tap targets: ${JSON.stringify(await cdp.evaluate(TAP_TARGET_PROBE))}`);

  // Walk with the joystick. Spawn is by the entrance; pushing down-right walks
  // along world +x towards the solo tables.
  const stick = await cdp.box('[aria-label^="Cần điều khiển"]');
  note(`joystick: ${JSON.stringify(stick)}`);
  if (!stick) throw new Error('No joystick on a touch device');

  const prompt = () => cdp.evaluate(`document.body.innerText.includes('để ngồi vào')`);
  const where = () =>
    cdp.evaluate(
      `document.body.innerText.includes('Đang ngồi') ? 'seated' : 'standing'`,
    );

  const before = await prompt();
  // Spawn is wherever the server had room, so push the stick around the
  // compass until a free chair comes within reach rather than assuming one
  // direction. Each leg is also a direction the mapping has to get right.
  const COMPASS = [
    ['down-right', 44, 14],
    ['down-left', -44, 14],
    ['up-right', 44, -14],
    ['right', 46, 0],
    ['down', 0, 46],
    ['up-left', -44, -14],
    ['left', -46, 0],
    ['up', 0, -46],
  ];
  let reached = false;
  const walked = [];
  for (const [name, dx, dy] of COMPASS) {
    if (reached) break;
    await cdp.drag({ x: stick.cx, y: stick.cy }, { x: stick.cx + dx, y: stick.cy + dy }, 900);
    await sleep(350);
    reached = await prompt();
    walked.push(`${name}${reached ? ' → seat in reach' : ''}`);
  }
  await cdp.shot(join(OUT_DIR, '03-walked.png'));
  note(`seat prompt before walking: ${before} · after walking: ${reached}`);
  note(`joystick legs: ${walked.join(', ')}`);
  note(`position after walking: ${await where()}`);

  // Sit with the action button.
  const action = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ngồi');
    if (!button) return null;
    const r = button.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height, disabled: button.disabled };
  })()`);
  note(`sit button: ${JSON.stringify(action)}`);
  if (action && !action.disabled) {
    await cdp.tap(action.cx, action.cy);
    await sleep(1200);
  }
  const seated = await cdp.evaluate(`document.body.innerText.includes('Đang ngồi')`);
  note(`seated by tapping the action button: ${seated}`);
  await cdp.shot(join(OUT_DIR, '04-seated.png'));

  // Every tab of the dock opens and fits.
  for (const [index, label] of ['Âm thanh', 'Mọi người', 'Trò chuyện', 'Màn hình'].entries()) {
    const tab = await cdp.evaluate(`(() => {
      const nav = document.querySelector('nav[aria-label="Bảng điều khiển quán"]');
      const button = [...nav.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(label)}));
      if (!button) return null;
      const r = button.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
    })()`);
    if (!tab) {
      note(`tab "${label}": MISSING`);
      continue;
    }
    await cdp.tap(tab.cx, tab.cy);
    await sleep(500);
    await cdp.shot(join(OUT_DIR, `05-tab-${index}-${label.split(' ')[0].toLowerCase()}.png`));
    const overflow = await cdp.evaluate(OVERFLOW_PROBE);
    note(`tab "${label}": ${Math.round(tab.w)}x${Math.round(tab.h)} · overflow ${JSON.stringify(overflow.bad)}`);
    // Tapping the room above the sheet is the other way out of it. The
    // panels are not all the same height, so aim just above whichever one is
    // showing rather than at a fixed point.
    const above = await cdp.evaluate(`(() => {
      const sheet = document.querySelector('nav[aria-label="Bảng điều khiển quán"]')
        ?.previousElementSibling?.firstElementChild;
      if (!sheet) return null;
      const r = sheet.getBoundingClientRect();
      return Math.max(80, Math.round(r.top) - 24);
    })()`);
    await cdp.tap(195, above ?? 300);
    await sleep(350);
    const stillOpen = await cdp.evaluate(
      `document.querySelector('nav[aria-label="Bảng điều khiển quán"] button[aria-pressed="true"]') !== null`,
    );
    if (stillOpen) {
      note(`tab "${label}": did NOT close when tapping outside`);
      await cdp.tap(tab.cx, tab.cy);
      await sleep(300);
    }
  }

  // The overflow menu on the status strip.
  const more = await cdp.box('[aria-label="Thêm tuỳ chọn"]');
  if (more) {
    await cdp.tap(more.cx, more.cy);
    await sleep(400);
    await cdp.shot(join(OUT_DIR, '06-status-menu.png'));
    note(`status menu opened: ${await cdp.evaluate(`document.body.innerText.includes('Rời quán')`)}`);
    await cdp.tap(200, 400);
    await sleep(300);
  } else {
    note('status menu: MISSING');
  }

  // Onboarding, which on a phone must describe the joystick, not W A S D.
  await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Trợ giúp'));
    button?.click();
  })()`);
  await sleep(500);
  await cdp.shot(join(OUT_DIR, '07-onboarding.png'));
  note(
    `onboarding mentions the joystick: ${await cdp.evaluate(`document.body.innerText.includes('cần điều khiển')`)}`,
  );
  note(
    `onboarding still says W A S D: ${await cdp.evaluate(`document.body.innerText.includes('W, A, S, D')`)}`,
  );
  await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Bỏ qua'));
    button?.click();
  })()`);
  await sleep(400);

  // Sideways, where height is the scarce axis.
  await cdp.emulate(LANDSCAPE);
  await sleep(900);
  await cdp.shot(join(OUT_DIR, '08-landscape.png'));
  note(`landscape overflow: ${JSON.stringify(await cdp.evaluate(OVERFLOW_PROBE))}`);

  // And a tablet, where the floating column comes back and the dock goes away.
  await cdp.emulate({ width: 820, height: 1180, deviceScaleFactor: 2 });
  await sleep(900);
  await cdp.shot(join(OUT_DIR, '09-tablet.png'));
  note(
    `tablet: dock ${await cdp.evaluate(`Boolean(document.querySelector('nav[aria-label="Bảng điều khiển quán"]'))`)}` +
      ` · side column ${await cdp.evaluate(`Boolean([...document.querySelectorAll('div')].find((d) => d.className.includes?.('w-[300px]')))`)}`,
  );
  note(`tablet overflow: ${JSON.stringify(await cdp.evaluate(OVERFLOW_PROBE))}`);

  const errors = await cdp.evaluate(`JSON.stringify(window.__cafeErrors ?? [])`);
  note(`client errors: ${errors}`);

  writeFileSync(join(OUT_DIR, 'report.txt'), `${logs.join('\n')}\n`);
  console.log(`\nShots and report in ${OUT_DIR}`);

  cdp.close();
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
