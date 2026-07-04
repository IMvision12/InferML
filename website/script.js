// Detect OS, set the primary download button label/icon, and fetch the
// latest GitHub release to point each download CTA at the right installer.
(function () {
  // Source repo (IMvision12/localml) is private; releases are mirrored to
  // this public repo so anonymous users can fetch the API + assets.
  const REPO = 'IMvision12/localml-app';
  const RELEASES_LATEST = `https://github.com/${REPO}/releases/latest`;

  const ua = (navigator.userAgent || '').toLowerCase();
  const plat = (navigator.platform || '').toLowerCase();

  let os = 'windows';
  if (ua.includes('mac') || plat.includes('mac')) os = 'mac';
  else if (ua.includes('linux') || plat.includes('linux')) os = 'linux';

  const labels = {
    windows: 'Download for Windows',
    mac: 'Download for macOS',
    linux: 'Download for Linux',
  };
  const icons = {
    // Windows — four angled tiles, inherit button text color for contrast
    windows: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M0 3.449 9.75 2.1v9.451H0"/><path d="M10.949 1.94 23.99 0v11.4H10.949"/><path d="M0 12.6h9.75v9.451L0 20.699"/><path d="M10.949 12.6H24V24l-13.051-1.9"/></svg>`,
    // Apple logo — inherits currentColor
    mac: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.74 1.18 0 2.5-.82 3.83-.7 1.5.12 2.65.72 3.4 1.8-3.09 1.85-2.35 5.92.48 7.07-.56 1.48-1.29 2.96-2.73 4.05h-.06zm-5.11-14.34c-.09-2.5 2.03-4.6 4.36-4.65.24 2.83-2.64 4.79-4.36 4.65"/></svg>`,
    // Tux — monochrome (inherits currentColor) for cleaner contrast on the button
    linux: `<svg viewBox="0 0 32 32" width="20" height="20" fill="currentColor"><path d="M16 4c-3.6 0-5.5 2.6-5.5 5.6 0 1.5.5 2.4.5 2.4-1.2 1.2-2.9 2.9-3.4 4.9-.4 1.7.1 3.1.8 4 .6.7 1.5 1 2.1.6.6-.4.5-1.3.5-1.3-.4-2 .9-3.1 1.7-3.8.4-.4.9-.8 1.3-1.4.4.6.9 1 1.3 1.4.8.7 2.1 1.8 1.7 3.8 0 0-.1.9.5 1.3.6.4 1.5.1 2.1-.6.7-.9 1.2-2.3.8-4-.5-2-2.2-3.7-3.4-4.9 0 0 .5-.9.5-2.4C21.5 6.6 19.6 4 16 4z"/></svg>`,
  };

  const text = document.getElementById('cta-text');
  const iconEl = document.getElementById('cta-icon');
  if (text) text.textContent = labels[os] || labels.windows;
  if (iconEl) iconEl.innerHTML = icons[os] || icons.windows;

  // Pick the asset that matches a given OS from a release's asset list.
  // Mac may have x64 + arm64 dmgs — prefer arm64 (most modern Macs); fall
  // back to whatever's there.
  function pickAsset(assets, target) {
    if (!Array.isArray(assets)) return null;
    const isExe   = a => /\.exe$/i.test(a.name);
    const isDmg   = a => /\.dmg$/i.test(a.name);
    const isImage = a => /\.AppImage$/i.test(a.name);
    if (target === 'windows') return assets.find(isExe) || null;
    if (target === 'linux')   return assets.find(isImage) || null;
    if (target === 'mac') {
      const arm = assets.find(a => isDmg(a) && /arm64|aarch64/i.test(a.name));
      if (arm) return arm;
      return assets.find(isDmg) || null;
    }
    return null;
  }

  // 60 unauthenticated requests/hour per IP — cache the response so a single
  // user reloading repeatedly doesn't burn quota.
  const CACHE_KEY = 'localml-latest-release';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  function cached() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.t) > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch { return null; }
  }
  function setCached(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data })); } catch {}
  }

  async function fetchLatest() {
    const c = cached();
    if (c) return c;
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    setCached(data);
    return data;
  }

  function applyRelease(data) {
    if (!data || !data.assets) return;
    const tag = data.tag_name || '';
    const verEl = document.getElementById('cta-version');
    if (verEl && tag) verEl.textContent = tag;

    // Primary CTA — point at the OS-matching asset.
    const primary = document.getElementById('cta-download');
    const primaryAsset = pickAsset(data.assets, os);
    if (primary && primaryAsset) primary.href = primaryAsset.browser_download_url;

    // Per-platform cards — each one points at its own OS asset, regardless
    // of the visitor's actual OS.
    for (const target of ['windows', 'mac', 'linux']) {
      const el = document.getElementById(`plat-${target}`);
      if (!el) continue;
      const asset = pickAsset(data.assets, target);
      if (asset) el.href = asset.browser_download_url;
    }
  }

  fetchLatest()
    .then(applyRelease)
    .catch(err => {
      // Fail silently — links already point at /releases/latest in HTML,
      // which always works as a fallback.
      console.warn('[localml] failed to fetch latest release:', err.message);
    });

})();

// Toggle nav border on scroll for subtle separation.
(function () {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 8) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Fade-in-on-scroll with staggered delay per card in a grid.
(function () {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.1 }
  );
  // Parent-level reveals (no stagger)
  document.querySelectorAll('.section-head, .screenshot-frame').forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)';
    io.observe(el);
  });
  // Grid reveals with stagger
  ['.feat-grid', '.model-families', '.plat-grid'].forEach((gridSel) => {
    const cards = document.querySelectorAll(`${gridSel} > *`);
    cards.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
      el.style.transition = `opacity 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 60}ms, transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 60}ms, border-color 0.3s, box-shadow 0.3s`;
      io.observe(el);
    });
  });
})();

// Populate the constellation-particle field in the hero background.
(function () {
  const host = document.getElementById('hero-stars');
  if (!host) return;
  const COUNT = 24;
  for (let i = 0; i < COUNT; i++) {
    const s = document.createElement('span');
    s.style.top = (Math.random() * 100) + '%';
    s.style.left = (Math.random() * 100) + '%';
    s.style.animationDelay = (Math.random() * 6) + 's';
    s.style.animationDuration = (4 + Math.random() * 5) + 's';
    s.style.width = s.style.height = (1.5 + Math.random() * 2.5) + 'px';
    host.appendChild(s);
  }
})();

// Mouse-follow halo on feature cards — reads cursor position, pipes to CSS var.
(function () {
  const cards = document.querySelectorAll('.feat');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });
  });
})();

// Subtle parallax on hero aurora — shifts with mouse (2–3px max).
(function () {
  const aurora = document.querySelector('.hero-aurora');
  const stars = document.getElementById('hero-stars');
  if (!aurora) return;
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 14;
    const y = (e.clientY / window.innerHeight - 0.5) * 14;
    aurora.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (stars) stars.style.transform = `translate3d(${x * 0.5}px, ${y * 0.5}px, 0)`;
  });
})();
