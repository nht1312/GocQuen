/**
 * Measures realtime fan-out cost as occupancy rises (SPEC 11.3 — the instance
 * capacity is explicitly "to be confirmed by load test").
 *
 *   node tools/load-test.mjs [count] [seconds]
 *
 * Connects `count` guests to one instance, has them all walk continuously at
 * MOVE_SEND_HZ, and counts what each client receives. Two numbers matter:
 *
 *   frames  - socket.io messages delivered. This is the cost that used to grow
 *             as N×(N-1); with tick batching it grows as N×WORLD_TICK_HZ.
 *   updates - individual player positions carried inside those frames. Still
 *             O(N²) by nature, but bytes are far cheaper than frames.
 *
 * Targets $CAFE_URL (default http://localhost:4000). Read-only: it joins,
 * moves and leaves. Reports move latency from /metrics.json alongside.
 */
import { io } from 'socket.io-client';
import { MOVE_SEND_HZ, isWalkable } from '@virtual-cafe/shared';

const BASE = process.env.CAFE_URL ?? 'http://localhost:4000';
const count = Number.parseInt(process.argv[2] ?? '25', 10);
const seconds = Number.parseInt(process.argv[3] ?? '10', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, body, token) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());

const clients = [];
let frames = 0;
let updates = 0;
let sent = 0;

async function connect() {
  const guest = await post('/auth/guest', {});
  await post('/cafe/join', {}, guest.token);
  const socket = io(BASE, { auth: { token: guest.token }, transports: ['websocket'] });
  await new Promise((resolve) => socket.on('connect', resolve));
  const snapshot = await new Promise((resolve) => {
    socket.once('world:snapshot', resolve);
    socket.emit('world:join', {});
  });
  socket.on('world:delta', (payload) => {
    frames += 1;
    updates += payload?.players?.length ?? 0;
  });
  clients.push({ socket, x: snapshot.self.x, y: snapshot.self.y, seq: 0, angle: Math.random() * Math.PI * 2 });
  return snapshot;
}

console.log(`Connecting ${count} guests to ${BASE} …`);
for (let i = 0; i < count; i += 1) await connect();

const instances = await fetch(`${BASE}/cafe`).then((r) => r.json());
console.log(`Connected. Online: ${instances.onlineCount}, capacity/instance: ${instances.capacity ?? 'n/a'}`);
console.log(`All ${count} walking for ${seconds}s at ${MOVE_SEND_HZ} Hz …\n`);

// Everyone wanders; movement must stay under the server's speed limit.
const interval = setInterval(() => {
  for (const c of clients) {
    c.angle += (Math.random() - 0.5) * 0.6;
    const nx = c.x + Math.cos(c.angle) * 0.12;
    const ny = c.y + Math.sin(c.angle) * 0.12;
    if (isWalkable(nx, ny, 0.3)) { c.x = nx; c.y = ny; } else { c.angle += Math.PI; }
    c.seq += 1;
    sent += 1;
    c.socket.emit('player:move', { sequence: c.seq, x: c.x, y: c.y, direction: 'south_east' });
  }
}, Math.round(1000 / MOVE_SEND_HZ));

const started = Date.now();
await sleep(seconds * 1000);
clearInterval(interval);
const elapsed = (Date.now() - started) / 1000;

const metrics = await fetch(`${BASE}/metrics.json`).then((r) => r.json()).catch(() => null);

const inPerSec = sent / elapsed;
const framesPerSec = frames / elapsed;
const updatesPerSec = updates / elapsed;
console.log(`guests                   : ${count}`);
console.log(`client->server msgs/s    : ${inPerSec.toFixed(0)}`);
console.log(`server->client FRAMES/s  : ${framesPerSec.toFixed(0)}   <- the fan-out cost`);
console.log(`server->client updates/s : ${updatesPerSec.toFixed(0)}   (positions inside those frames)`);
console.log(`frame amplification      : ${(framesPerSec / inPerSec).toFixed(2)}x  (per-event relay would be ${count - 1}x)`);
if (metrics?.moveLatencyMs) {
  const m = metrics.moveLatencyMs;
  console.log(`move latency ms        : p50 ${m.p50 ?? '?'}  p95 ${m.p95 ?? '?'}  max ${m.max ?? '?'}`);
}
if (metrics?.counters?.events_rate_limited_total !== undefined) {
  console.log(`rate-limited events    : ${metrics.counters.events_rate_limited_total}`);
  console.log(`rejected events        : ${metrics.counters.events_rejected_total}`);
}

for (const c of clients) { c.socket.emit('world:leave', {}); c.socket.close(); }
await sleep(300);
process.exit(0);
