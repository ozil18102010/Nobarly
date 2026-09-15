const ESPORTS_EVENTS = [  {
    id: 'vct-2026',
    name: 'VCT 2026 - Masters Madrid',
    game: 'Valorant',
    icon: 'fa-crosshairs',
    date: '2026-03-15T18:00:00+07:00',
    stream_url: 'https://www.youtube.com/@Valorant',
    stream_channel: 'valorant',
    stream_type: 'youtube',
    prize: '$500,000',
    teams: ['Sentinels', 'LOUD', 'Fnatic', 'DRX', 'Paper Rex', 'Evil Geniuses'],
    status: 'upcoming'
  },
  {
    id: 'ti-2026',
    name: 'The International 2026',
    game: 'Dota 2',
    icon: 'fa-shield-halved',
    date: '2026-08-20T12:00:00+07:00',
    stream_url: 'https://www.twitch.tv/dota2',
    stream_channel: 'dota2',
    stream_type: 'twitch',
    prize: '$3,000,000+',
    teams: ['Team Spirit', 'Team Liquid', 'Gaimin Gladiators', 'Tundra', 'PSG.LGD'],
    status: 'upcoming'
  },
  {
    id: 'm-series-2026',
    name: 'M-Series 2026 World Championship',
    game: 'Mobile Legends',
    icon: 'fa-mobile-screen',
    date: '2026-07-10T19:00:00+07:00',
    stream_url: 'https://www.youtube.com/@MobileLegendsBangBang',
    stream_channel: 'MobileLegendsBangBang',
    stream_type: 'youtube',
    prize: '$3,000,000',
    teams: ['ONIC', 'RRQ', 'Blacklist International', 'ECHO', 'ONIC PH'],
    status: 'upcoming'
  },
  {
    id: 'vct-champions-2026',
    name: 'VCT Champions 2026',
    game: 'Valorant',
    icon: 'fa-crosshairs',
    date: '2026-12-01T18:00:00+07:00',
    stream_url: 'https://www.youtube.com/@Valorant',
    stream_channel: 'valorant',
    stream_type: 'youtube',
    prize: '$1,000,000',
    teams: ['TBD'],
    status: 'upcoming'
  },
  {
    id: 'lol-worlds-2026',
    name: 'Worlds 2026',
    game: 'League of Legends',
    icon: 'fa-chess-rook',
    date: '2026-10-05T17:00:00+07:00',
    stream_url: 'https://www.twitch.tv/lol',
    stream_channel: 'lol',
    stream_type: 'twitch',
    prize: '$2,225,000',
    teams: ['T1', 'Gen.G', 'JDG', 'Bilibili Gaming', 'G2 Esports'],
    status: 'upcoming'
  },
  {
    id: 'cs2-major-2026',
    name: 'PGL Major Copenhagen 2026',
    game: 'CS2',
    icon: 'fa-gun',
    date: '2026-04-20T15:00:00+07:00',
    stream_url: 'https://www.twitch.tv/pgl',
    stream_channel: 'pgl',
    stream_type: 'twitch',
    prize: '$1,250,000',
    teams: ['FaZe Clan', 'Natus Vincere', 'Team Vitality', 'G2 Esports', 'MOUZ'],
    status: 'upcoming'
  },
  {
    id: 'mlbb-mpl',
    name: 'MPL Indonesia Season 13',
    game: 'Mobile Legends',
    icon: 'fa-mobile-screen',
    date: '2026-02-14T19:00:00+07:00',
    stream_url: 'https://www.youtube.com/@MaborangOfficial',
    stream_channel: 'MaborangOfficial',
    stream_type: 'youtube',
    prize: '$300,000',
    teams: ['ONIC', 'RRQ', 'EVOS', 'Bigetron', 'Alter Ego'],
    status: 'live'
  },
  {
    id: 'valorant-challengers',
    name: 'VCT Challengers Indonesia',
    game: 'Valorant',
    icon: 'fa-crosshairs',
    date: '2026-01-25T18:00:00+07:00',
    stream_url: 'https://www.youtube.com/@Valorant',
    stream_channel: 'valorant',
    stream_type: 'youtube',
    prize: '$50,000',
    teams: ['ONIC', 'Team Republic', 'Natus Vincere', 'BOOM Esports'],
    status: 'ended'
  }
];

function getEventStatus(event) {
  const now = new Date();
  const eventDate = new Date(event.date);
  const diff = eventDate - now;

  if (event.status === 'live') return { label: 'LIVE', class: 'status-live' };
  if (event.status === 'ended') return { label: 'ENDED', class: 'status-ended' };
  if (diff <= 0) return { label: 'LIVE NOW', class: 'status-live' };

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return { label: `${days}H ${hours}J ${minutes}M`, class: 'status-upcoming' };
  if (hours > 0) return { label: `${hours}J ${minutes}M`, class: 'status-soon' };
  return { label: `${minutes}M`, class: 'status-soon' };
}

function loadEsportsEvents() {
  const body = document.getElementById('content-body');

  const liveEvents = ESPORTS_EVENTS.filter(e => e.status === 'live' || getEventStatus(e).class === 'status-live');
  const upcomingEvents = ESPORTS_EVENTS.filter(e => e.status === 'upcoming' && getEventStatus(e).class !== 'status-live');
  const endedEvents = ESPORTS_EVENTS.filter(e => e.status === 'ended');

  let html = '';

  if (liveEvents.length > 0) {
    html += `<div class="esports-section">
      <h3 class="esports-section-title"><i class="fas fa-circle" style="color: #ff4444; animation: pulse 1s infinite;"></i> LIVE SEKARANG</h3>
      <div class="esports-grid">${liveEvents.map(e => renderEsportsCard(e, true)).join('')}</div>
    </div>`;
  }

  if (upcomingEvents.length > 0) {
    html += `<div class="esports-section">
      <h3 class="esports-section-title"><i class="fas fa-clock"></i> UPCOMING</h3>
      <div class="esports-grid">${upcomingEvents.map(e => renderEsportsCard(e, false)).join('')}</div>
    </div>`;
  }

  if (endedEvents.length > 0) {
    html += `<div class="esports-section">
      <h3 class="esports-section-title"><i class="fas fa-check-circle"></i> SELESAI</h3>
      <div class="esports-grid">${endedEvents.map(e => renderEsportsCard(e, false)).join('')}</div>
    </div>`;
  }

  body.innerHTML = html;

  ESPORTS_EVENTS.forEach(event => {
    if (event.status !== 'ended') {
      startCountdown(event.id, new Date(event.date));
    }
  });
}

function renderEsportsCard(event, isLive) {
  const status = getEventStatus(event);
  const eventDate = new Date(event.date);
  const dateStr = eventDate.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = eventDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="esports-card ${isLive ? 'esports-card-live' : ''}">
      <div class="esports-card-header">
        <div class="esports-game-icon"><i class="fas ${event.icon}"></i></div>
        <div class="esports-card-info">
          <span class="esports-game-name">${escapeHtml(event.game)}</span>
          <span class="esports-status ${status.class}" id="status-${event.id}">${status.label}</span>
        </div>
      </div>
      <h3 class="esports-card-title">${escapeHtml(event.name)}</h3>
      <div class="esports-card-meta">
        <p><i class="fas fa-calendar"></i> ${dateStr} - ${timeStr} WIB</p>
        <p><i class="fas fa-trophy"></i> ${escapeHtml(event.prize)}</p>
      </div>
      <div class="esports-teams">
        ${event.teams.map(t => `<span class="esports-team-badge">${escapeHtml(t)}</span>`).join('')}
      </div>
      <div class="esports-card-actions">
        ${event.status !== 'ended' ? `<button class="btn btn-primary btn-nobar" onclick="createNobarFromEvent('${event.id}')"><i class="fas fa-tv"></i> Nobar Event Ini</button>` : ''}
        <button class="btn btn-secondary" onclick="openStreamUrl('${event.stream_url}')"><i class="fas fa-external-link-alt"></i> Buka Stream</button>
      </div>
    </div>`;
}

// Buka stream eksternal: di APK pakai browser sistem (WebView pindah = app serasa mati).
function openStreamUrl(url) {
  try {
    if (!url) return;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (_) { window.location.href = url; }
}

// Registry interval countdown supaya bisa dibersihkan tiap pindah halaman
// (dipanggil dari renderPage). Tanpa ini, tiap buka halaman Nobar menumpuk
// interval yang jalan selamanya meski halamannya sudah ditinggalkan.
var esportsCountdownIntervals = [];

function clearEsportsCountdowns() {
  esportsCountdownIntervals.forEach(clearInterval);
  esportsCountdownIntervals = [];
}

function startCountdown(eventId, targetDate) {
  const interval = setInterval(() => {
    const now = new Date();
    const diff = targetDate - now;

    if (diff <= 0) {
      clearInterval(interval);
      const statusEl = document.getElementById(`status-${eventId}`);
      if (statusEl) {
        statusEl.textContent = 'LIVE NOW';
        statusEl.className = 'esports-status status-live';
      }
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const statusEl = document.getElementById(`status-${eventId}`);
    if (statusEl) {
      if (days > 0) statusEl.textContent = `${days}H ${hours}J ${minutes}D ${seconds}s`;
      else if (hours > 0) statusEl.textContent = `${hours}J ${minutes}D ${seconds}s`;
      else statusEl.textContent = `${minutes}D ${seconds}s`;
    }
  }, 1000);
  esportsCountdownIntervals.push(interval);
}

function createNobarFromEvent(eventId) {
  const event = ESPORTS_EVENTS.find(e => e.id === eventId);
  if (!event) return;

  let embedUrl = event.stream_url;
  if (event.stream_type === 'youtube') {
    embedUrl = `https://www.youtube.com/embed?channel=${event.stream_channel}`;
  } else {
    let twParent = 'localhost';
    try { twParent = window.location.hostname || 'localhost'; } catch (_) {}
    if (!twParent) twParent = 'localhost';
    embedUrl = `https://player.twitch.tv/?channel=${event.stream_channel}&parent=${encodeURIComponent(twParent)}&parent=localhost`;
  }

  document.getElementById('watch-title').value = event.name;
  document.getElementById('watch-url').value = embedUrl;
  document.getElementById('watch-type').value = event.stream_type;

  document.getElementById('create-watch-modal').classList.add('active');
}
