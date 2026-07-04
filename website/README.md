# LocalML website

Static landing page. No framework, no build step - just open `index.html` in a browser.

## Structure

```
website/
├── index.html         # single-page landing
├── styles.css         # design tokens + sections
├── script.js          # copy-to-clipboard, platform highlight, scroll effects
├── install.sh         # macOS/Linux installer  (curl -fsSL .../install.sh | sh)
├── install.ps1        # Windows installer       (irm .../install.ps1 | iex)
├── assets/
│   └── favicon.svg    # LocalML constellation mark
└── README.md          # this file
```

## Install scripts

`install.sh` and `install.ps1` are served as static files from the site root, so
the landing page can advertise a one-liner:

```
# Windows
irm https://localml.app/install.ps1 | iex
# macOS / Linux
curl -fsSL https://localml.app/install.sh | sh
```

Each script **requires an existing Python 3.10+** (it does *not* install Python -
if it's missing the script prints where to get it and stops), then bootstraps
pipx and runs `pipx install localml` (server only). The inference stack
(PyTorch + transformers) is installed **inside the app** on first launch, once
the user picks CPU or GPU - so the script stays fast and hardware-agnostic.

> The scripts and the page hard-code `https://localml.app`. If you deploy to a
> different domain, find-and-replace that host in `install.sh`, `install.ps1`,
> and `index.html` (hero command, the `#install` one-liners, and `script.js`'s
> Windows override). Serving over **HTTPS** is required for `| iex` / `| sh`.

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
6. **Output Directory**: *(leave empty - uses repo root)*

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

- Change the install command: edit the `.cmd[data-copy]` block in the hero and the `#install` steps.
- Change the tagline: edit `.hero-h1` + `.hero-sub`.
- Change the API snippet: edit the `.api-pre` code in the `#api` section (the copy button reads the rendered text, so no separate `data-copy` is needed there).
- Swap the mock screenshot for a real one: replace the `.screenshot-content` block with an `<img src="assets/screenshot.png">`.
- Bump the cache-bust query strings (`styles.css?v=…`, `script.js?v=…`) whenever you edit those files.

## Things to replace before launch

- [ ] All `https://github.com/` links → actual repo URL
- [ ] Replace the `localml.app` host in `install.sh`, `install.ps1`, `index.html` and `script.js` if deploying elsewhere
- [ ] Publish `localml` to PyPI so `pipx install localml` (and the install scripts) resolve, and the PyPI footer link works
- [ ] Confirm the host serves `install.sh` / `install.ps1` as `text/plain` (or any type - `curl`/`irm` don't care) over HTTPS
- [ ] Add a real product screenshot (`assets/screenshot.png`) and swap the mock in `.screenshot-content`
- [ ] Add OG image (`assets/og.png` - 1200×630) and a `<meta property="og:image">` tag
