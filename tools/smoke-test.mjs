/**
 * End-to-end smoke test against a running server.
 * Two real socket clients: join, walk, race for a seat, voice scope, chat scope.
 */
import { io } from 'socket.io-client';
import { userSeats, seatAnchor, isWalkable, MAP_WIDTH, MAP_HEIGHT } from '@virtual-cafe/shared';

const BASE = process.env.CAFE_URL ?? 'http://localhost:4000';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`);
};

const post = async (path, body, token) => {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const wait = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function makeClient(label) {
  const guest = await post('/auth/guest', { displayName: label });
  const token = guest.body.token;
  await post('/cafe/join', {}, token);
  const socket = io(BASE, { auth: { token }, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  const snapshotPromise = wait(socket, 'world:snapshot');
  socket.emit('world:join', {});
  const snapshot = await snapshotPromise;
  return { token, socket, snapshot, userId: guest.body.userId, errors: [] };
}

/** Breadth-first path over walkable tile centres. */
function findPath(from, to) {
  const key = (x, y) => `${x},${y}`;
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
  const queue = [start];
  const cameFrom = new Map([[key(start.x, start.y), null]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.x === goal.x && current.y === goal.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      if (cameFrom.has(key(nx, ny))) continue;
      if (!isWalkable(nx + 0.5, ny + 0.5)) continue;
      cameFrom.set(key(nx, ny), current);
      queue.push({ x: nx, y: ny });
    }
  }

  if (!cameFrom.has(key(goal.x, goal.y))) return null;
  const path = [];
  let node = goal;
  while (node) {
    path.unshift({ x: node.x + 0.5, y: node.y + 0.5 });
    node = cameFrom.get(key(node.x, node.y));
  }
  return path;
}

/** Walk a path by sending valid-speed move packets, like the real client does. */
async function walkTo(client, target) {
  const path = findPath(client.snapshot.self, target);
  if (!path) throw new Error(`no path to ${target.x},${target.y}`);
  let { x, y } = client.snapshot.self;
  let seq = client.sequence ?? 0;

  // Match the real client's send rate; anything faster trips the rate limiter.
  const SEND_INTERVAL_MS = 70;
  const STEP = 0.3;
  for (const waypoint of path) {
    for (let i = 0; i < 40; i += 1) {
      const dx = waypoint.x - x;
      const dy = waypoint.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.05) break;
      const step = Math.min(STEP, dist);
      x += (dx / dist) * step;
      y += (dy / dist) * step;
      seq += 1;
      client.socket.emit('player:move', { sequence: seq, x, y, direction: 'south_east' });
      await sleep(SEND_INTERVAL_MS);
    }
  }
  client.sequence = seq;
  client.snapshot.self.x = x;
  client.snapshot.self.y = y;
  await sleep(150);
  return { x, y };
}

async function main() {
  const unauth = io(BASE, { auth: { token: 'nonsense' }, transports: ['websocket'] });
  const rejected = await new Promise((resolve) => {
    unauth.on('system:error', (payload) => resolve(payload.code));
    unauth.on('disconnect', () => resolve('disconnected'));
    setTimeout(() => resolve('none'), 3000);
  });
  check('rejects an invalid session token', rejected === 'forbidden' || rejected === 'disconnected', rejected);
  unauth.close();

  const alice = await makeClient('Alice');
  const bob = await makeClient('Bob');
  alice.socket.on('system:error', (e) => alice.errors.push(e));
  bob.socket.on('system:error', (e) => bob.errors.push(e));

  check('both guests land in the same instance', alice.snapshot.instanceId === bob.snapshot.instanceId,
    alice.snapshot.instanceId.slice(0, 8));
  check('snapshot carries the café population', alice.snapshot.npcs.length === 5 && alice.snapshot.seats.length === 31,
    `npcs=${alice.snapshot.npcs.length} seats=${alice.snapshot.seats.length}`);

  // --- movement authority -------------------------------------------------
  const cheat = new Promise((resolve) => alice.socket.once('player:correction', resolve));
  alice.socket.emit('player:move', { sequence: 9999, x: 20, y: 3, direction: 'south' });
  const correction = await cheat.catch(() => null);
  check('server corrects a teleport attempt', correction?.reason === 'speed', correction?.reason);

  // --- seat race ----------------------------------------------------------
  const seat = userSeats().find((s) => s.seatGroupId === 'group_a');
  await walkTo(alice, seatAnchor(seat));
  await walkTo(bob, seatAnchor(seat));

  const aliceSeated = wait(alice.socket, 'seat:occupied').catch(() => null);
  alice.socket.emit('player:sit', { seatId: seat.seatId });
  bob.socket.emit('player:sit', { seatId: seat.seatId });
  const occupied = await aliceSeated;
  await sleep(300);
  const conflict = bob.errors.find((e) => e.code === 'conflict');
  check('one seat, one person', occupied?.userId === alice.userId && Boolean(conflict), conflict?.message);

  // --- voice scope --------------------------------------------------------
  const otherSeat = userSeats().find((s) => s.seatGroupId === 'group_b');
  await walkTo(bob, seatAnchor(otherSeat));
  bob.socket.emit('player:sit', { seatId: otherSeat.seatId });
  await sleep(250);

  const aliceGroup = wait(alice.socket, 'voice:group').catch(() => null);
  alice.socket.emit('voice:join', {});
  const group = await aliceGroup;
  check('voice group is the table you sit at', group?.groupId === 'group_a', group?.groupId);

  bob.errors.length = 0;
  bob.socket.emit('voice:join', { groupId: 'group_a' });
  await sleep(250);
  check('cannot join another table\'s conversation',
    bob.errors.some((e) => e.code === 'forbidden'),
    bob.errors[0]?.message);

  // This check has to hold both with and without an SFU configured, because
  // the same suite runs on a bare dev box and on a deployment with LiveKit
  // credentials. With an SFU it asserts the stronger property: the token must
  // grant exactly the caller's own table and nothing else (SPEC 14.1).
  const tokenResult = await post('/voice/token', {}, alice.token);
  if (tokenResult.body?.available === true) {
    const [, payload] = String(tokenResult.body.token ?? '').split('.');
    let grant = null;
    try {
      grant = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8'));
    } catch {
      grant = null;
    }
    const room = grant?.video?.room;
    check('voice token grants only your own table',
      typeof tokenResult.body.token === 'string' &&
        room === tokenResult.body.room &&
        room?.endsWith('__group_a') === true &&
        grant?.video?.roomJoin === true,
      room);
  } else {
    check('voice token refused when no SFU is configured',
      tokenResult.body?.token === null,
      tokenResult.body?.reason);
  }

  // --- chat scope ---------------------------------------------------------
  let bobHeard = false;
  bob.socket.on('chat:received', () => { bobHeard = true; });
  const aliceEcho = wait(alice.socket, 'chat:received').catch(() => null);
  alice.socket.emit('chat:send', { body: 'anyone else freezing today?' });
  const echo = await aliceEcho;
  await sleep(400);
  check('table chat reaches your own table', echo?.body === 'anyone else freezing today?');
  check('table chat does not reach another table', bobHeard === false);

  // --- stand up releases seat and voice -----------------------------------
  const released = wait(bob.socket, 'seat:released').catch(() => null);
  alice.socket.emit('player:stand', {});
  const releaseEvent = await released;
  check('standing up frees the seat for everyone', releaseEvent?.seatId === seat.seatId, releaseEvent?.seatId);

  // --- rate limiting ------------------------------------------------------
  alice.errors.length = 0;
  for (let i = 0; i < 20; i += 1) alice.socket.emit('chat:send', { body: `spam ${i}` });
  await sleep(500);
  check('chat flooding is rate limited', alice.errors.some((e) => e.code === 'rate_limited'));

  // --- reconnect keeps the seat ------------------------------------------
  bob.socket.emit('player:sit', { seatId: otherSeat.seatId });
  await sleep(200);
  bob.socket.disconnect();
  await sleep(500);
  const bobAgain = io(BASE, { auth: { token: bob.token }, transports: ['websocket'] });
  await new Promise((r) => bobAgain.on('connect', r));
  const resumed = wait(bobAgain, 'world:snapshot');
  bobAgain.emit('world:join', {});
  const snap2 = await resumed;
  check('reconnect keeps your seat', snap2.self.seatId === otherSeat.seatId, snap2.self.seatId);
  check('reconnect never resumes the microphone',
    snap2.self.voice.micOn === false && snap2.self.voice.groupId === null);

  // --- invalid payloads ---------------------------------------------------
  const badErrors = [];
  bobAgain.on('system:error', (e) => badErrors.push(e));
  bobAgain.emit('player:move', { sequence: -1, x: 'over there', direction: 'up' });
  bobAgain.emit('player:sit', {});
  await sleep(300);
  check('malformed payloads are rejected, not crashed on', badErrors.length >= 2,
    badErrors.map((e) => e.code).join(','));

  // --- metrics ------------------------------------------------------------
  const metrics = await fetch(BASE + '/metrics').then((r) => r.text());
  check('metrics expose occupancy and counters',
    metrics.includes('cafe_online_users') && metrics.includes('seat_conflicts_total'));

  alice.socket.close();
  bobAgain.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('smoke test crashed:', error);
  process.exit(1);
});
