import './styles.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div class="logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" stroke-width="2"/>
          <path d="m10 9 5 3-5 3V9Z" fill="currentColor"/>
        </svg>
      </div>
      <div>
        <p class="eyebrow">Authorized media download tool</p>
        <h1>YouTube Downloader</h1>
        <p class="lead">Paste a YouTube video link, review the available formats, then download a copy you are authorized to keep. No account or login required.</p>
      </div>
    </header>

    <section class="panel">
      <div class="steps">
        <div class="step active" data-step="1"><span>1</span><b>Paste link</b></div>
        <div class="step" data-step="2"><span>2</span><b>Choose format</b></div>
        <div class="step" data-step="3"><span>3</span><b>Download</b></div>
      </div>

      <div class="body">
        <div class="notice">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke="currentColor" stroke-width="2"/>
            <path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div>
            <strong>Download only content you own or have permission to save.</strong>
            <p>This tool is intended for your own uploads, licensed content, public-domain media, and other authorized downloads.</p>
          </div>
        </div>

        <form id="urlForm" class="url-form">
          <label for="youtubeUrl">YouTube video URL</label>
          <div class="input-row">
            <div class="input-wrap">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <input id="youtubeUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=..." required />
            </div>
            <button class="primary" id="analyzeButton" type="submit">
              <span>Analyze video</span>
            </button>
          </div>
        </form>

        <label class="rights-check">
          <input id="rightsCheck" type="checkbox" />
          <span>I confirm that I own this content or have permission to download it.</span>
        </label>

        <div id="loading" class="loading" hidden>
          <div class="spinner"></div>
          <div>
            <strong>Checking the video…</strong>
            <p>Retrieving title, thumbnail, and available source formats.</p>
          </div>
        </div>

        <div id="errorBox" class="error" hidden role="alert"></div>

        <section id="videoCard" class="video-card" hidden>
          <img id="thumbnail" alt="" />
          <div class="video-copy">
            <span class="source-pill">YouTube</span>
            <h2 id="videoTitle"></h2>
            <p id="videoMeta"></p>
            <a id="sourceLink" href="#" target="_blank" rel="noopener noreferrer">Open original video</a>
          </div>
        </section>

        <section id="formatsSection" class="formats-section" hidden>
          <div class="section-heading">
            <div>
              <p class="eyebrow">Available source files</p>
              <h2>Choose a download</h2>
            </div>
            <span id="formatCount" class="count-pill"></span>
          </div>

          <div class="format-group">
            <h3>Video + audio</h3>
            <div id="videoFormats" class="format-list"></div>
          </div>

          <div id="audioGroup" class="format-group">
            <h3>Audio only</h3>
            <div id="audioFormats" class="format-list"></div>
          </div>
        </section>

        <div id="downloadNote" class="download-note" hidden>
          <span class="check">✓</span>
          <div>
            <strong>Download started</strong>
            <p>Keep this page open until your browser begins saving the file.</p>
          </div>
        </div>

        <p class="footnote">No account or login required. This site is not affiliated with or endorsed by YouTube or Google.</p>
      </div>
    </section>
  </main>
`;

const $ = (selector) => document.querySelector(selector);

const form = $('#urlForm');
const urlInput = $('#youtubeUrl');
const rightsCheck = $('#rightsCheck');
const analyzeButton = $('#analyzeButton');
const loading = $('#loading');
const errorBox = $('#errorBox');
const videoCard = $('#videoCard');
const thumbnail = $('#thumbnail');
const videoTitle = $('#videoTitle');
const videoMeta = $('#videoMeta');
const sourceLink = $('#sourceLink');
const formatsSection = $('#formatsSection');
const videoFormats = $('#videoFormats');
const audioFormats = $('#audioFormats');
const audioGroup = $('#audioGroup');
const formatCount = $('#formatCount');
const downloadNote = $('#downloadNote');

let currentUrl = '';

function setStep(active) {
  document.querySelectorAll('.step').forEach((step) => {
    const number = Number(step.dataset.step);
    step.classList.toggle('active', number === active);
    step.classList.toggle('done', number < active);
    step.querySelector('span').textContent = number < active ? '✓' : String(number);
  });
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearState() {
  errorBox.hidden = true;
  errorBox.textContent = '';
  videoCard.hidden = true;
  formatsSection.hidden = true;
  downloadNote.hidden = true;
  videoFormats.innerHTML = '';
  audioFormats.innerHTML = '';
  setStep(1);
}

function secondsToTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function makeFormatRow(format, kind) {
  const row = document.createElement('div');
  row.className = 'format-row';

  const label = kind === 'video'
    ? (format.qualityLabel || format.quality || 'Video')
    : (format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : 'Audio');

  const details = [
    format.container?.toUpperCase(),
    format.fps ? `${format.fps} fps` : '',
    bytes(format.contentLength)
  ].filter(Boolean).join(' • ');

  const info = document.createElement('div');
  info.className = 'format-info';
  info.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(details || 'Source stream')}</span>`;

  const link = document.createElement('a');
  link.className = 'download';
  link.href = `/api/download?url=${encodeURIComponent(currentUrl)}&itag=${encodeURIComponent(format.itag)}`;
  link.textContent = 'Download';
  link.addEventListener('click', (event) => {
    if (!rightsCheck.checked) {
      event.preventDefault();
      showError('Confirm that you have permission to download this content first.');
      rightsCheck.focus();
      return;
    }
    errorBox.hidden = true;
    downloadNote.hidden = false;
    setStep(3);
  });

  row.append(info, link);
  return row;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearState();

  if (!rightsCheck.checked) {
    showError('Please confirm that you own the content or have permission to download it.');
    rightsCheck.focus();
    return;
  }

  currentUrl = urlInput.value.trim();
  analyzeButton.disabled = true;
  loading.hidden = false;

  try {
    const response = await fetch(`/api/info?url=${encodeURIComponent(currentUrl)}`, {
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'The video could not be analyzed.');
    }

    thumbnail.src = data.thumbnail || '';
    thumbnail.alt = data.title ? `Thumbnail for ${data.title}` : 'Video thumbnail';
    videoTitle.textContent = data.title || 'Untitled video';
    videoMeta.textContent = [data.author, secondsToTime(data.duration)].filter(Boolean).join(' • ');
    sourceLink.href = data.canonicalUrl || currentUrl;
    videoCard.hidden = false;

    const videos = Array.isArray(data.videoFormats) ? data.videoFormats : [];
    const audios = Array.isArray(data.audioFormats) ? data.audioFormats : [];

    videos.forEach((item) => videoFormats.appendChild(makeFormatRow(item, 'video')));
    audios.forEach((item) => audioFormats.appendChild(makeFormatRow(item, 'audio')));

    audioGroup.hidden = audios.length === 0;
    formatCount.textContent = `${videos.length + audios.length} option${videos.length + audios.length === 1 ? '' : 's'}`;
    formatsSection.hidden = false;
    setStep(2);

    if (!videos.length && !audios.length) {
      throw new Error('No downloadable source formats were returned for this video.');
    }
  } catch (error) {
    showError(error?.message || 'Something went wrong while checking this video.');
    setStep(1);
  } finally {
    loading.hidden = true;
    analyzeButton.disabled = false;
  }
});
