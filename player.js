// ================================================
//  KUHIRO — गीतसँगै एउटा यात्रा
//  player.js — YouTube IFrame API + all controls
// ================================================

const PLAYLIST_ID = 'PLmpveeGXz2FLSjybweccsCxEVPIThqXBN';

// ── State ──────────────────────────────────────
let player        = null;
let isPlaying     = false;
let isShuffle     = false;
let repeatMode    = 0;       // 0=off 1=all 2=one
let isMuted       = false;
let currentIndex  = 0;
let totalSongs    = 0;
let songs         = [];
let shuffleOrder  = [];
let progressTimer = null;
let reelTimer     = null;
let isSwitching   = false;   // true while changing tracks — suppresses false pause
let switchTimeout = null;

// ── Fallback song list (shown before YT loads) ──
const FALLBACK_SONGS = [
  { title: 'Nepali Song 1',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 2',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 3',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 4',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 5',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 6',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 7',  artist: 'KUHIRO Playlist' },
  { title: 'Nepali Song 8',  artist: 'KUHIRO Playlist' },
];

// ================================================
//  CLOCK  — English, live
// ================================================
function updateClock() {
  const now  = new Date();
  let   h    = now.getHours();
  const m    = now.getMinutes();
  const s    = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';

  h = h % 12 || 12;

  const pad  = n => String(n).padStart(2, '0');
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
  const dateStr = `${DAYS[now.getDay()]}, ${MONS[now.getMonth()]} ${now.getDate()}`;

  const el = document.getElementById('clock-time');
  const pe = document.getElementById('clock-period');
  const de = document.getElementById('clock-date');
  if (el) el.textContent = timeStr;
  if (pe) pe.textContent = ampm;
  if (de) de.textContent = dateStr;
}
setInterval(updateClock, 1000);
updateClock();

// ================================================
//  LIVE USER TRACKER
//  Uses localStorage so the number persists across
//  reloads and doesn't jump randomly every refresh.
//  Drifts ±1 slowly every ~8 seconds — feels real.
// ================================================
let liveUsers = 0;
const LIVE_KEY      = 'kuhiro_live_base';
const LIVE_FLOOR    = 24;   // never drops below this
const LIVE_CEILING  = 87;   // never goes above this

function initLiveUsers() {
  // Use a stored base so it doesn't re-randomise on every refresh
  const stored = parseInt(localStorage.getItem(LIVE_KEY));
  if (stored && stored >= LIVE_FLOOR && stored <= LIVE_CEILING) {
    liveUsers = stored;
  } else {
    // First time: pick a reasonable starting number
    liveUsers = Math.floor(Math.random() * 20) + 34; // 34–53
    localStorage.setItem(LIVE_KEY, liveUsers);
  }
  setLiveDisplay(liveUsers);
}

function driftLiveUsers() {
  // 70% chance of ±1, 30% no change — very slow, natural feel
  const roll = Math.random();
  if (roll < 0.35)      liveUsers = Math.min(LIVE_CEILING, liveUsers + 1);
  else if (roll < 0.70) liveUsers = Math.max(LIVE_FLOOR,   liveUsers - 1);
  // else: stay the same

  localStorage.setItem(LIVE_KEY, liveUsers);
  animateCount(
    document.getElementById('live-count'),
    parseInt(document.getElementById('live-count')?.textContent) || liveUsers,
    liveUsers, 600
  );
}

function setLiveDisplay(n) {
  const el = document.getElementById('live-count');
  if (el) el.textContent = n;
}

function animateCount(el, from, to, duration) {
  if (!el || from === to) return;
  const start = performance.now();
  const diff  = to - from;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(from + diff * p);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

initLiveUsers();
// Slow drift: every 8 seconds
setInterval(driftLiveUsers, 8000);

// ================================================
//  YOUTUBE IFrame API
// ================================================
function loadYouTubeAPI() {
  const tag  = document.createElement('script');
  tag.src    = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt-player', {
    height: '1',
    width:  '1',
    playerVars: {
      listType:       'playlist',
      list:           PLAYLIST_ID,
      autoplay:       0,
      controls:       0,
      rel:            0,
      fs:             0,
      modestbranding: 1,
      playsinline:    1,
      origin:         window.location.origin || 'http://localhost:3000',
    },
    events: {
      onReady:       onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError:       onPlayerError,
    },
  });
};

function onPlayerReady() {
  player.setVolume(80);
  updateVolumeSlider(80);

  setTimeout(() => {
    try {
      const ids = player.getPlaylist();
      if (ids && ids.length > 0) {
        buildSongsFromIds(ids);
      } else {
        buildFallback();
      }
    } catch (e) {
      buildFallback();
    }
    removeLoadingOverlay();
  }, 1800);
}

function buildSongsFromIds(ids) {
  songs = ids.map((vid, i) => ({
    title:     FALLBACK_SONGS[i] ? FALLBACK_SONGS[i].title : `Track ${i + 1}`,
    artist:    'KUHIRO Playlist',
    videoId:   vid,
    thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
  }));
  totalSongs = songs.length;
  buildShuffleOrder();
  renderPlaylist();
  updateSongDisplay(0);
  updateCounter();
}

function buildFallback() {
  songs = FALLBACK_SONGS.map((s, i) => ({
    title:     s.title,
    artist:    s.artist,
    videoId:   '',
    thumbnail: '',
  }));
  totalSongs = songs.length;
  buildShuffleOrder();
  renderPlaylist();
  updateSongDisplay(0);
  updateCounter();
}

// ================================================
//  PLAYER STATE HANDLER
// ================================================
function onPlayerStateChange(event) {
  const S = YT.PlayerState;

  if (event.data === S.PLAYING) {
    isSwitching = false;          // track loaded — clear the switch flag
    if (switchTimeout) { clearTimeout(switchTimeout); switchTimeout = null; }
    isPlaying = true;
    setPlayBtn(true);
    startProgress();
    startReels(false);

    // Sync index & pull real title/thumb from YT
    try {
      const idx = player.getPlaylistIndex();
      if (idx >= 0 && idx !== currentIndex) {
        currentIndex = idx;
        updatePlaylistActive(idx);
        updateCounter();
      }
      const vd = player.getVideoData();
      if (vd && vd.title) {
        const clean = vd.title.split('|')[0].split('-')[0].trim();
        document.getElementById('song-title').textContent   = clean;
        document.getElementById('song-artist').textContent  = 'KUHIRO — Nepali Songs';
        document.getElementById('cass-label-title').textContent =
          clean.length > 12 ? clean.slice(0, 12) + '…' : clean;

        if (vd.video_id) {
          const img = document.getElementById('thumb-img');
          img.src = `https://img.youtube.com/vi/${vd.video_id}/mqdefault.jpg`;
          img.style.display = 'block';
          const fb = document.getElementById('pill-art-fallback');
          if (fb) fb.style.display = 'none';
        }
        // Update playlist item title too
        if (songs[currentIndex]) {
          songs[currentIndex].title = clean;
          const nameEl = document.querySelector(`#pl-item-${currentIndex} .pl-name`);
          if (nameEl) nameEl.textContent = clean;
        }
      }
    } catch (e) {}

  } else if (event.data === S.PAUSED) {
    // Suppress the brief PAUSED flash that fires when switching tracks
    if (isSwitching) return;
    isPlaying = false;
    setPlayBtn(false);
    stopProgress();
    slowReels();

  } else if (event.data === S.ENDED) {
    isPlaying = false;
    setPlayBtn(false);
    stopProgress();
    stopReels();
    handleEnd();

  } else if (event.data === S.BUFFERING) {
    // keep spinner feel — reels idle
    startReels(true); // slow spin
  }
}

function onPlayerError(event) {
  console.warn('YT error:', event.data);
  showToast('Skipping to next track…');
  setTimeout(nextSong, 1500);
}

// ================================================
//  CONTROLS
// ================================================
function togglePlay() {
  if (!player) return;
  isPlaying ? player.pauseVideo() : player.playVideo();
}

function markSwitching() {
  isSwitching = true;
  if (switchTimeout) clearTimeout(switchTimeout);
  // Safety: clear flag after 4s even if PLAYING never fires
  switchTimeout = setTimeout(() => { isSwitching = false; }, 4000);
}

function prevSong() {
  if (!player) return;
  try {
    const t = player.getCurrentTime();
    if (t > 3) { player.seekTo(0, true); return; }
  } catch (e) {}

  markSwitching();
  if (isShuffle) {
    const pos     = shuffleOrder.indexOf(currentIndex);
    const prevPos = (pos - 1 + shuffleOrder.length) % shuffleOrder.length;
    currentIndex  = shuffleOrder[prevPos];
    player.playVideoAt(currentIndex);
  } else {
    player.previousVideo();
  }
  showToast('⏮  Previous');
}

function nextSong() {
  if (!player) return;
  markSwitching();
  if (isShuffle) {
    const pos    = shuffleOrder.indexOf(currentIndex);
    const nxt    = (pos + 1) % shuffleOrder.length;
    currentIndex = shuffleOrder[nxt];
    player.playVideoAt(currentIndex);
  } else {
    player.nextVideo();
  }
  showToast('⏭  Next');
}

function handleEnd() {
  if (repeatMode === 2) {
    player.seekTo(0, true);
    player.playVideo();
  } else if (repeatMode === 1) {
    nextSong();
  } else {
    if (currentIndex + 1 < totalSongs) nextSong();
  }
}

// ── Seek ──────────────────────────────────────
function seekTo(event) {
  if (!player) return;
  const bar  = document.getElementById('prog-track');
  const rect = bar.getBoundingClientRect();
  const pct  = (event.clientX - rect.left) / rect.width;
  try {
    const dur = player.getDuration();
    if (dur) player.seekTo(pct * dur, true);
  } catch (e) {}
}

// ── Volume ────────────────────────────────────
function setVolume(val) {
  if (!player) return;
  player.setVolume(parseInt(val));
  if (isMuted && val > 0) {
    isMuted = false;
    player.unMute();
    setMuteBtn(false);
  }
  updateVolumeSlider(val);
}

function toggleMute() {
  if (!player) return;
  isMuted = !isMuted;
  isMuted ? player.mute() : player.unMute();
  setMuteBtn(isMuted);
  showToast(isMuted ? '🔇  Muted' : '🔊  Unmuted');
}

function setMuteBtn(m) {
  document.getElementById('vol-icon').style.display  = m ? 'none'  : 'block';
  document.getElementById('mute-icon').style.display = m ? 'block' : 'none';
}

function updateVolumeSlider(val) {
  const s   = document.getElementById('vol-slider');
  if (!s) return;
  const pct = (val / 100) * 100;
  s.style.background =
    `linear-gradient(to right, #f97316 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
}

// ── Shuffle ───────────────────────────────────
function toggleShuffle() {
  isShuffle = !isShuffle;
  document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
  if (isShuffle) { buildShuffleOrder(); showToast('🔀  Shuffle On'); }
  else           { showToast('Shuffle Off'); }
}

function buildShuffleOrder() {
  const len = totalSongs || songs.length || 1;
  shuffleOrder = Array.from({ length: len }, (_, i) => i);
  for (let i = shuffleOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
  }
}

// ── Repeat ────────────────────────────────────
const REPEAT_ICONS = [
  // off
  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  // repeat all — same icon, active class handles color
  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>`,
  // repeat one
  `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    <text x="10.5" y="14.5" font-size="6.5" fill="currentColor" stroke="none" font-weight="700">1</text>
  </svg>`,
];

function toggleRepeat() {
  repeatMode = (repeatMode + 1) % 3;
  const btn  = document.getElementById('btn-repeat');
  btn.innerHTML = REPEAT_ICONS[repeatMode];
  btn.classList.toggle('active', repeatMode > 0);
  const msgs = ['Repeat Off', '🔁  Repeat All', '🔂  Repeat One'];
  showToast(msgs[repeatMode]);
}

// ================================================
//  PROGRESS BAR
// ================================================
function startProgress() {
  stopProgress();
  progressTimer = setInterval(tickProgress, 500);
}
function stopProgress() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function tickProgress() {
  if (!player || !player.getCurrentTime) return;
  try {
    const cur = player.getCurrentTime();
    const tot = player.getDuration();
    if (!tot || isNaN(tot)) return;

    const pct = (cur / tot) * 100;
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('time-cur').textContent  = fmtTime(cur);
    document.getElementById('time-tot').textContent  = fmtTime(tot);
  } catch (e) {}
}

function fmtTime(s) {
  if (isNaN(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ================================================
//  CASSETTE REELS
// ================================================
function startReels(slow) {
  stopReelTimer();
  const l = document.getElementById('reel-left');
  const r = document.getElementById('reel-right');
  if (!l || !r) return;

  if (slow) {
    l.classList.add('reel-idle');
    r.classList.add('reel-idle');
    l.classList.remove('reel-spinning', 'reel-spinning-rev');
    r.classList.remove('reel-spinning', 'reel-spinning-rev');
  } else {
    l.classList.add('reel-spinning');
    r.classList.add('reel-spinning-rev');
    l.classList.remove('reel-idle', 'reel-spinning-rev');
    r.classList.remove('reel-idle', 'reel-spinning');
  }
}

function slowReels() { startReels(true); }

function stopReels() {
  stopReelTimer();
  ['reel-left', 'reel-right'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('reel-spinning', 'reel-spinning-rev', 'reel-idle');
  });
}

function stopReelTimer() {
  if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
}

// ================================================
//  UI UPDATES
// ================================================
function setPlayBtn(playing) {
  document.getElementById('play-icon').style.display  = playing ? 'none'  : 'block';
  document.getElementById('pause-icon').style.display = playing ? 'block' : 'none';
  const ring = document.getElementById('art-ring');
  if (ring) ring.classList.toggle('spinning', playing);
}

function updateSongDisplay(idx) {
  const song = songs[idx];
  if (!song) return;
  document.getElementById('song-title').textContent  = song.title;
  document.getElementById('song-artist').textContent = song.artist;
  document.getElementById('cass-label-title').textContent =
    song.title.length > 12 ? song.title.slice(0, 12) + '…' : song.title;

  if (song.thumbnail) {
    const img = document.getElementById('thumb-img');
    img.src = song.thumbnail; img.style.display = 'block';
    const fb = document.getElementById('pill-art-fallback');
    if (fb) fb.style.display = 'none';
    // Tint pill background to match art color
    const pillBg = document.getElementById('pill-bg');
    if (pillBg) {
      pillBg.style.background = `linear-gradient(120deg, rgba(100,30,20,0.6) 0%, rgba(60,15,50,0.45) 100%)`;
    }
  } else {
    const img = document.getElementById('thumb-img');
    if (img) img.style.display = 'none';
    const fb = document.getElementById('pill-art-fallback');
    if (fb) fb.style.display = 'flex';
  }
}

function updateCounter() {
  document.getElementById('cur-idx').textContent  = currentIndex + 1;
  document.getElementById('tot-songs').textContent = totalSongs || '—';
}

// ================================================
//  PLAYLIST UI
// ================================================
function renderPlaylist() {
  const wrap = document.getElementById('playlist-items');
  wrap.innerHTML = '';

  songs.forEach((song, i) => {
    const el       = document.createElement('div');
    el.className   = `pl-item${i === currentIndex ? ' active' : ''}`;
    el.id          = `pl-item-${i}`;
    el.onclick     = () => playSongAt(i);
    el.innerHTML   = `
      <div class="pl-num">${i + 1}</div>
      <div class="pl-bars">
        <div class="pl-bar"></div>
        <div class="pl-bar"></div>
        <div class="pl-bar"></div>
      </div>
      <div class="pl-thumb">
        ${song.thumbnail
          ? `<img src="${song.thumbnail}" alt="${song.title}" loading="lazy" />`
          : '🎵'}
      </div>
      <div class="pl-info">
        <div class="pl-name">${song.title}</div>
        <div class="pl-artist">${song.artist}</div>
      </div>`;
    wrap.appendChild(el);
  });
}

function updatePlaylistActive(idx) {
  document.querySelectorAll('.pl-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  const active = document.getElementById(`pl-item-${idx}`);
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function playSongAt(idx) {
  if (!player) return;
  markSwitching();
  currentIndex = idx;
  player.playVideoAt(idx);
  updateSongDisplay(idx);
  updatePlaylistActive(idx);
  updateCounter();
}

function togglePlaylist() {
  document.getElementById('playlist-panel').classList.toggle('hidden');
}

// ================================================
//  TOAST
// ================================================
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ================================================
//  LOADING OVERLAY
// ================================================
function makeLoadingOverlay() {
  const el       = document.createElement('div');
  el.id          = 'loading-overlay';
  el.className   = 'loading-overlay';
  el.innerHTML   = `
    <div class="loading-logo">K<span>U</span>H<span>I</span>R<span>O</span></div>
    <div class="loading-spinner"></div>
    <div class="loading-text">गीत लोड हुँदैछ…</div>`;
  document.body.appendChild(el);
}

function removeLoadingOverlay() {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => el.remove(), 700);
}

// ================================================
//  KEYBOARD SHORTCUTS
// ================================================
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.key) {
    case ' ': case 'k':      e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': case 'l': e.preventDefault(); nextSong(); break;
    case 'ArrowLeft':  case 'j': e.preventDefault(); prevSong(); break;
    case 'm':  toggleMute();     break;
    case 's':  toggleShuffle();  break;
    case 'r':  toggleRepeat();   break;
    case 'p':  togglePlaylist(); break;
  }
});

// ================================================
//  INIT
// ================================================
makeLoadingOverlay();
loadYouTubeAPI();
slowReels();

// Hard fallback — if YT never responds after 10s
setTimeout(() => {
  removeLoadingOverlay();
  if (!songs.length) buildFallback();
}, 10000);
