/**
 * Does a shared screen actually reach the other people at the table?
 *
 *   node tools/screen-share-check.mjs
 *
 * Drives three real clients against a running server (default
 * http://localhost:4000): two walk to the same table and one to the next one
 * along, then one of the pair starts a share over the same REST endpoint the
 * web app uses. The check is what the other two hear.
 *
 * This exists because the REST endpoints and the socket events are two doors
 * onto the same publisher slot, and for a while only the socket door
 * announced anything — so the web app, which uses the REST door, claimed a
 * slot that nobody at the table was ever told about.
 *
 * The last three checks hand the minted tokens to a headless browser and put
 * a real track across the SFU; see tools/media-check.mjs. They report SKIP
 * rather than failing when there is no browser to drive.
 */
import { io } from 'socket.io-client';
import { runMediaCheck } from './media-check.mjs';

const SERVER = process.env.SERVER_URL ?? 'http://localhost:4000';
const WALK_STEP = 0.15; // tiles per frame, ~2.2 tiles/s at 15 Hz — well inside the speed check
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, token, body) {
  const response = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${text}`);
  return json;
}

class Client {
  constructor(name) {
    this.name = name;
    this.events = [];
    this.x = 0;
    this.y = 0;
    this.sequence = 0;
  }

  async enter() {
    const guest = await post('/auth/guest', null, { displayName: this.name });
    this.token = guest.token;
    await post('/cafe/join', this.token);

    this.socket = io(SERVER, { auth: { token: this.token }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('connect_error', reject);
    });

    for (const event of ['screen-share:started', 'screen-share:stopped', 'screen-share:failed']) {
      this.socket.on(event, (payload) => this.events.push({ event, payload }));
    }
    this.socket.on('player:correction', (payload) => {
      // The server is the authority on where we are; follow it rather than
      // arguing, otherwise one rejected step desynchronises the whole walk.
      this.x = payload.x;
      this.y = payload.y;
      this.rejected = payload.reason;
    });

    const snapshot = await new Promise((resolve) => {
      this.socket.once('world:snapshot', resolve);
      this.socket.emit('world:join', {});
    });
    this.userId = snapshot.self.userId;
    this.x = snapshot.self.x;
    this.y = snapshot.self.y;
    return this;
  }

  /** Walk to a point one legal step at a time, as a real client does. */
  async walkTo(targetX, targetY) {
    for (let guard = 0; guard < 600; guard += 1) {
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.05) return;
      const step = Math.min(WALK_STEP, distance);
      this.x += (dx / distance) * step;
      this.y += (dy / distance) * step;
      this.sequence += 1;
      this.socket.emit('player:move', {
        sequence: this.sequence,
        x: this.x,
        y: this.y,
        direction: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'south' : 'north',
      });
      await sleep(1000 / 15);
    }
    throw new Error(`${this.name} could not reach ${targetX},${targetY} (stuck at ${this.x.toFixed(2)},${this.y.toFixed(2)}${this.rejected ? ` — ${this.rejected}` : ''})`);
  }

  /** Follow a corridor of known-clear waypoints rather than cutting corners. */
  async walkPath(points) {
    for (const [x, y] of points) await this.walkTo(x, y);
  }

  async sit(seatId) {
    this.socket.emit('player:sit', { seatId });
    await sleep(300);
  }

  take() {
    const taken = this.events;
    this.events = [];
    return taken;
  }

  async leave() {
    // Leave for real, so a rerun is not blocked by three avatars still
    // standing in the aisle for the length of the grace window.
    await post('/cafe/leave', this.token).catch(() => undefined);
    this.socket?.close();
  }
}

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const alice = await new Client('Alice').enter();
  const bob = await new Client('Bob').enter();
  const carol = await new Client('Carol').enter();

  // Alice and Bob take opposite sides of the group table; Carol sits at a
  // different one, and must never hear a word about their screen.
  // Row 16 is the clear corridor across the floor; the columns at x=12 and
  // x=18 run north between the tables without clipping any of them.
  await alice.walkPath([[2.5, 16.5], [12.5, 16.5], [12.5, 6.5], [13.5, 6.5]]);
  await alice.sit('group_a:1');

  await bob.walkPath([[2.5, 16.5], [18.5, 16.5], [18.5, 6.5], [16.5, 6.5]]);
  await bob.sit('group_a:3');

  await carol.walkPath([[2.5, 16.5], [18.5, 16.5], [18.5, 10.5], [16.5, 10.5]]);
  await carol.sit('group_b:3');
  await sleep(300);

  alice.take();
  bob.take();
  carol.take();

  const started = await post('/voice/screen-share/start', alice.token);
  check('the server accepts the claim', started.active === true, JSON.stringify(started.session?.groupId));
  await sleep(500);

  const bobStarted = bob.take().filter((e) => e.event === 'screen-share:started');
  check('the other person at the table is told a share started', bobStarted.length === 1,
    bobStarted.length ? `publisher ${bobStarted[0].payload.publisherName}` : 'heard nothing');

  const aliceStarted = alice.take().filter((e) => e.event === 'screen-share:started');
  check("the publisher's own client is told too", aliceStarted.length === 1,
    aliceStarted.length ? '' : 'heard nothing — its panel would tear the share straight back down');

  check('nobody at another table hears about it', carol.take().length === 0);

  // Each of them can mint a token for the table's screen room; only Alice may publish.
  const aliceToken = await post('/voice/screen-share/token', alice.token);
  const bobToken = await post('/voice/screen-share/token', bob.token);
  const carolToken = await post('/voice/screen-share/token', carol.token);
  const grantOf = (t) => JSON.parse(Buffer.from(t.token.split('.')[1], 'base64url').toString()).video;

  check('publisher and viewer share one room', aliceToken.room === bobToken.room, aliceToken.room);
  check('another table gets a different room', carolToken.room !== aliceToken.room, carolToken.room);
  check('only the publisher may publish a screen',
    grantOf(aliceToken).canPublish === true && grantOf(bobToken).canPublish === false);
  check('no microphone rides along with a screen token',
    !grantOf(aliceToken).canPublishSources.includes('microphone'));

  // The one leg no unit test can reach: a real track across the real SFU.
  const media = await runMediaCheck({
    url: aliceToken.url,
    publisherToken: aliceToken.token,
    viewerToken: bobToken.token,
  });
  if (media.skipped) {
    console.log(`SKIP  a screen actually crosses the SFU — ${media.skipped}`);
  } else if (media.error) {
    check('a screen actually crosses the SFU', false, media.error);
  } else {
    check("the publisher sees their own screen", media.localPublished && media.localSize?.[0] > 0,
      `local ${media.localSize?.join('x')}`);
    check('the viewer receives the screen track', media.remoteSubscribed,
      `source ${media.remoteSource}`);
    check('the viewer gets real frames, not a black rectangle',
      media.remoteSize?.[0] > 0 && media.remoteChanged,
      `remote ${media.remoteSize?.join('x')}, brightness ${media.remoteBrightness}`);
  }

  const stopped = await post('/voice/screen-share/stop', alice.token);
  check('the server accepts the stop', stopped.active === false);
  await sleep(500);
  check('the table is told it ended',
    bob.take().filter((e) => e.event === 'screen-share:stopped').length === 1);
  check("the publisher is told it ended",
    alice.take().filter((e) => e.event === 'screen-share:stopped').length === 1);

  for (const client of [alice, bob, carol]) await client.leave();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
