import { Innertube } from 'youtubei.js';
import { Readable } from 'node:stream';

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

function safeName(value) {
  return String(value || 'youtube-video')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'youtube-video';
}

function extensionFor(format) {
  const mime = format?.mime_type || '';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  return 'bin';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const input = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  const videoId = videoIdFromUrl(input);
  const itag = Number(req.query.itag);

  if (!videoId || !Number.isInteger(itag)) {
    return res.status(400).json({ error: 'Invalid download request.' });
  }

  try {
    const youtube = await getYouTube();
    const info = await youtube.getInfo(videoId);
    const basic = info.basic_info || {};

    if (basic.is_private || basic.is_live || basic.is_live_content || basic.is_upcoming) {
      return res.status(403).json({ error: 'This video type is not supported.' });
    }

    const allFormats = [
      ...(info.streaming_data?.formats || []),
      ...(info.streaming_data?.adaptive_formats || [])
    ];

    const format = allFormats.find((item) =>
      item.itag === itag &&
      !item.drm_families?.length &&
      (item.has_audio || item.has_video)
    );

    if (!format) {
      return res.status(404).json({ error: 'That format is no longer available. Analyze the video again.' });
    }

    const stream = await info.download({ itag });
    const ext = extensionFor(format);
    const filename = `${safeName(basic.title)}.${ext}`;

    res.statusCode = 200;
    res.setHeader('Content-Type', (format.mime_type || 'application/octet-stream').split(';')[0]);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    if (format.content_length) {
      res.setHeader('Content-Length', String(format.content_length));
    }

    const nodeStream = Readable.fromWeb(stream);
    req.on('close', () => {
      if (!res.writableEnded) nodeStream.destroy();
    });

    nodeStream.on('error', (error) => {
      console.error('YouTube stream error:', error);
      if (!res.headersSent) res.status(502).end('Download stream failed.');
      else res.destroy(error);
    });

    nodeStream.pipe(res);
  } catch (error) {
    console.error('YouTube download error:', error);
    if (!res.headersSent) {
      return res.status(502).json({
        error: 'The download could not be started. YouTube may have changed the source stream or temporarily limited this server.'
      });
    }
    res.destroy(error);
  }
}
