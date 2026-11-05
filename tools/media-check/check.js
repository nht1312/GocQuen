/**
 * The leg no unit test can reach: a real screen track crossing a real SFU.
 *
 * Both ends run in this one page — a publisher room holding the table's
 * publisher token and a viewer room holding another seat's token. They are
 * separate peer connections to LiveKit, so this proves the same thing two
 * browsers would, without two browsers.
 *
 * The capture itself is a painted canvas standing in for a display: the
 * source picker is the browser's own and is not ours to test, but everything
 * downstream of it is. The canvas counts up in colour so the viewer end can
 * tell a live frame from a black rectangle.
 */
import * as livekit from './livekit-client.esm.mjs';

const stage = document.getElementById('stage');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeDisplay() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  setInterval(() => {
    frame += 1;
    ctx.fillStyle = `hsl(${(frame * 11) % 360} 85% 45%)`;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(`CAFE ${frame}`, 40, 200);
  }, 66);
  return canvas.captureStream(15);
}

/** Average luminance, used only to tell a real frame from a black one. */
function brightness(video) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, 64, 36);
  const { data } = ctx.getImageData(0, 0, 64, 36);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return total / (data.length / 4);
}

window.run = async (url, publisherToken, viewerToken) => {
  const result = {
    localPublished: false,
    remoteSubscribed: false,
    remoteSource: null,
    localSize: null,
    remoteSize: null,
    remoteBrightness: 0,
    remoteChanged: false,
    error: null,
  };

  try {
    const display = fakeDisplay();
    navigator.mediaDevices.getDisplayMedia = async () => display;

    const viewer = new livekit.Room({ adaptiveStream: true, dynacast: true });
    let remoteVideo = null;
    viewer.on(livekit.RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== 'video') return;
      result.remoteSubscribed = true;
      result.remoteSource = track.source;
      remoteVideo = track.attach();
      remoteVideo.autoplay = true;
      remoteVideo.muted = true;
      remoteVideo.playsInline = true;
      stage.appendChild(remoteVideo);
    });
    await viewer.connect(url, viewerToken);

    const publisher = new livekit.Room({ adaptiveStream: true, dynacast: true });
    let localVideo = null;
    // The same wiring the café uses: LiveKit fires this one — and only this
    // one — for the publisher's own track.
    publisher.on(livekit.RoomEvent.LocalTrackPublished, (publication) => {
      const track = publication?.track;
      if (!track || track.kind !== 'video') return;
      result.localPublished = true;
      localVideo = track.attach();
      localVideo.autoplay = true;
      localVideo.muted = true;
      localVideo.playsInline = true;
      stage.appendChild(localVideo);
    });
    await publisher.connect(url, publisherToken);
    await publisher.localParticipant.setScreenShareEnabled(true, { audio: false });

    for (let attempt = 0; attempt < 60 && !(remoteVideo?.videoWidth > 0); attempt += 1) {
      await sleep(250);
    }

    if (localVideo) result.localSize = [localVideo.videoWidth, localVideo.videoHeight];
    if (remoteVideo) {
      result.remoteSize = [remoteVideo.videoWidth, remoteVideo.videoHeight];
      const first = brightness(remoteVideo);
      await sleep(700);
      const second = brightness(remoteVideo);
      result.remoteBrightness = Math.round(second);
      // The stand-in capture cycles through hues, so a frozen or black
      // rectangle reads the same twice and a live one does not.
      result.remoteChanged = Math.abs(first - second) > 2;
    }

    await publisher.disconnect();
    await viewer.disconnect();
  } catch (error) {
    result.error = String(error?.message ?? error);
  }
  return result;
};
