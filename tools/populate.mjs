/**
 * Fills the café with scripted guests, so you can see occupancy, presence and
 * seat sharing without opening a dozen browser tabs.
 *
 *   node tools/populate.mjs [count] [--group <tableId>]
 *
 * They walk to a free seat, sit down, set a status and stay until you stop the
 * process. Targets $CAFE_URL (default http://localhost:4000).
 */
import { io } from 'socket.io-client';
import { MAP_HEIGHT, MAP_WIDTH, isWalkable, seatAnchor, userSeats } from '@virtual-cafe/shared';

const BASE = process.env.CAFE_URL ?? 'http://localhost:4000';
const count = Number.parseInt(process.argv[2] ?? '4', 10);
const groupFlag = process.argv.indexOf('--group');
const onlyGroup = groupFlag > -1 ? process.argv[groupFlag + 1] : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const post = (path, body, token) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  }).then((response) => response.json());

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
      if (cameFrom.has(key(nx, ny)) || !isWalkable(nx + 0.5, ny + 0.5)) continue;
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

const seats = userSeats().filter((seat) => !onlyGroup || seat.seatGroupId === onlyGroup);
const statuses = ['working', 'focus', 'available'];
const sockets = [];

async function spawnGuest(index) {
  const guest = await post('/auth/guest', {});
  await post('/cafe/join', {}, guest.token);
  const socket = io(BASE, { auth: { token: guest.token }, transports: ['websocket'] });
  sockets.push(socket);
  await new Promise((resolve) => socket.on('connect', resolve));
  const snapshot = await new Promise((resolve) => {
    socket.once('world:snapshot', resolve);
    socket.emit('world:join', {});
  });

  const taken = new Set(snapshot.seats.filter((seat) => seat.userId).map((seat) => seat.seatId));
  const seat = seats.find((candidate) => !taken.has(candidate.seatId));
  if (!seat) {
    console.log(`${snapshot.self.displayName} found no free seat and is standing`);
    return;
  }

  const path = findPath(snapshot.self, seatAnchor(seat));
  let { x, y } = snapshot.self;
  let sequence = 0;
  for (const waypoint of path ?? []) {
    for (let i = 0; i < 40; i += 1) {
      const dx = waypoint.x - x;
      const dy = waypoint.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.05) break;
      const step = Math.min(0.3, distance);
      x += (dx / distance) * step;
      y += (dy / distance) * step;
      sequence += 1;
      socket.emit('player:move', { sequence, x, y, direction: 'south_east' });
      await sleep(70);
    }
  }

  socket.emit('player:sit', { seatId: seat.seatId });
  await sleep(200);
  socket.emit('player:state', { status: statuses[index % statuses.length] });
  console.log(`${snapshot.self.displayName} sat down at ${seat.seatId}`);
}

for (let i = 0; i < count; i += 1) {
  await spawnGuest(i);
}
console.log(`\n${count} guests seated. Ctrl+C to send them home.`);

const shutdown = () => {
  for (const socket of sockets) {
    socket.emit('world:leave', {});
    socket.close();
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
