# LocalML website

Static landing page. No framework, no build step — just open `index.html` in a browser.

## Structure

```
website/
├── index.html         # single-page landing
├── styles.css         # design tokens + sections
├── script.js          # OS-detect download button, scroll effects
├── assets/
│   └── favicon.svg    # LocalML constellation mark
└── README.md          # this file
```

## Local preview

```bash
# any static server works
cd website
python -m http.server 8080
# or: npx serve
```

Open `http://localhost:8080`.

## Deploy

### Vercel (recommended)

1. Push `localml/` repo to GitHub (done already).
2. [vercel.com/new](https://vercel.com/new) → import repo.
3. **Root Directory**: `website`
4. **Framework Preset**: `Other` (no build step)
5. **Build Command**: *(leave empty)*
6. **Output Directory**: *(leave empty — uses repo root)*

Every push to `main` redeploys automatically. Custom domain (e.g. `localml.app`) under Project → Domains.

### GitHub Pages

1. Repo Settings → Pages → Source: `main` / `website` folder.
2. Your page is live at `https://<you>.github.io/localml/`.

### Netlify

1. New site → connect repo.
2. **Base directory**: `website`
3. **Build command**: *(empty)*
4. **Publish directory**: `website`

## Updating

- Change the version badge: edit `.cta-version` in `index.html`.
- Change download links: find the four `https://github.com/` anchors and point them at your actual releases URL.
- Change the tagline: edit `.hero-h1` + `.hero-sub`.
- Swap the mock screenshot for a real one: replace the `.screenshot-content` block with an `<img src="assets/screenshot.png">`.

## Things to replace before launch

- [ ] All `https://github.com/` links → actual repo URL
- [ ] Download button anchor → GitHub Releases URL
- [ ] Add a real product screenshot (`assets/screenshot.png`) and swap the mock in `.screenshot-content`
- [ ] Add OG image (`assets/og.png` — 1200×630) and a `<meta property="og:image">` tag
- [ ] Point version badge at the actual current release
