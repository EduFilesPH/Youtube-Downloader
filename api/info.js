import { Innertube } from 'youtubei.js';

let youtubePromise;

function getYouTube() {
  if (!youtubePromise) {
    youtubePromise = Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      lang: 'en'
    });
  }
  return youtubePromise;
}

function videoIdFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host.endsWith('.youtube.com')) {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') return parts[1] || null;
  }

  return null;
}

function containerFromMime(mime = '') {
  if (mime.includes('webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.includes('mp4')) return 'mp4';
  return 'media';
}

function normalize(format) {
  return {
    itag: format.itag,
    quality: format.quality || null,
    qualityLabel: format.quality_label || null,
    width: format.width || null,
    height: format.height || null,
    fps: format.fps || null,
    bitrate: format.bitrate || null,
    contentLength: format.content_length || null,
    container: containerFromMime(format.mime_type),
    mimeType: format.mime_type
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const input = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const videoId = videoIdFromUrl(input);

  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    return res.status(400).json({ error: 'Enter a valid YouTube video or Shorts URL.' });
  }

  try {
    const youtube = await getYouTube();
    const info = await youtube.getInfo(videoId, { client: 'ANDROID_VR' });
    const basic = info.basic_info || {};

    if (basic.is_private) {
      return res.status(403).json({ error: 'Private videos are not supported.' });
    }

    if (basic.is_live || basic.is_live_content || basic.is_upcoming) {
      return res.status(400).json({ error: 'Live and upcoming streams are not supported.' });
    }

    if (!info.streaming_data) {
      const reason = String(info.playability_status?.reason || '');
      if (/sign in|not a bot|login/i.test(reason)) {
        return res.status(503).json({
          error: 'YouTube is temporarily blocking this server from retrieving the video. No user login is required or requested.'
        });
      }
      return res.status(422).json({
        error: reason || 'No downloadable stream data is available for this video.'
      });
    }

    const combined = (info.streaming_data.formats || [])
      .filter((format) => format.has_video && format.has_audio && !format.drm_families?.length)
      .map(normalize)
      .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0));

    const audio = (info.streaming_data.adaptive_formats || [])
      .filter((format) => format.has_audio && !format.has_video && !format.drm_families?.length)
      .map(normalize)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

    const videoFormats = dedupeBy(combined, (item) => `${item.qualityLabel}-${item.container}`).slice(0, 6);
    const audioFormats = dedupeBy(audio, (item) => `${Math.round((item.bitrate || 0) / 10000)}-${item.container}`).slice(0, 3);

    const thumbnails = basic.thumbnail || [];
    const bestThumb = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0];

    return res.status(200).json({
      id: videoId,
      title: basic.title || 'Untitled video',
      author: basic.author || basic.channel?.name || '',
      duration: basic.duration || 0,
      thumbnail: bestThumb?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      canonicalUrl: basic.url_canonical || `https://www.youtube.com/watch?v=${videoId}`,
      videoFormats,
      audioFormats
    });
  } catch (error) {
    console.error('YouTube info error:', error);
    const message = String(error?.message || '');
    const friendly = /429|rate limit/i.test(message)
      ? 'YouTube temporarily rate-limited this server. Please try again later.'
      : /sign in|not a bot|login|confirm/i.test(message)
        ? 'YouTube is temporarily blocking this server from retrieving the video. No user login is required or requested.'
        : 'The video could not be retrieved right now. Please verify the link and try again.';
    return res.status(502).json({ error: friendly });
  }
}
