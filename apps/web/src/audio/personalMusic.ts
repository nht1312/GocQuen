/**
 * Personal Focus Mode music: a link the listener pastes, played only in their
 * own browser. Nothing about it is sent to the server or to anyone else.
 */

export type PersonalSource =
  | { kind: 'audio'; url: string }
  | { kind: 'youtube'; embedUrl: string; watchUrl: string }
  | { kind: 'soundcloud'; embedUrl: string };

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)(\?.*)?$/i;

/** Turn a pasted link into something we can play, or explain why not. */
export function parseMusicLink(raw: string): PersonalSource | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: 'Link không hợp lệ.' };
  }
  if (url.protocol !== 'https:') return { error: 'Chỉ hỗ trợ link https://' };
  const host = url.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    const list = url.searchParams.get('list');
    const path = url.pathname.split('/').filter(Boolean);
    const id =
      host === 'youtu.be'
        ? path[0]
        : ['shorts', 'embed', 'live', 'v'].includes(path[0] ?? '')
          ? path[1]
          : url.searchParams.get('v');
    const params = new URLSearchParams({ autoplay: '1', loop: '1', controls: '1', playsinline: '1', rel: '0' });
    if (id && /^[\w-]{6,}$/.test(id)) {
      // `playlist` takes video ids, not a list id: passing the `list=` of a
      // mix/playlist link here broke the player. Loop the one video instead.
      params.set('playlist', id);
      return {
        kind: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${id}?${params}`,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
      };
    }
    // A playlist link with no video: only real playlists (PL…) embed; mixes
    // (RD…) and auto lists do not.
    if (list && !list.startsWith('RD')) {
      params.set('list', list);
      return {
        kind: 'youtube',
        embedUrl: `https://www.youtube.com/embed/videoseries?${params}`,
        watchUrl: `https://www.youtube.com/playlist?list=${list}`,
      };
    }
    if (list) return { error: 'Danh sách phát tự động (Mix) của YouTube không nhúng được. Hãy dán link một video.' };
    return { error: 'Không tìm thấy video trong link YouTube này.' };
  }

  if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
    const params = new URLSearchParams({ url: url.toString(), auto_play: 'true', visual: 'false' });
    return { kind: 'soundcloud', embedUrl: `https://w.soundcloud.com/player/?${params}` };
  }

  if (AUDIO_EXT.test(url.pathname)) return { kind: 'audio', url: url.toString() };

  return { error: 'Hỗ trợ link YouTube, SoundCloud hoặc file nhạc trực tiếp (.mp3, .m4a, .ogg…).' };
}
