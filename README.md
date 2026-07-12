<p align="center">
  <img src="assets/logo.png" alt="InferML logo" width="140" />
</p>

# InferML

Any Hugging Face model. Local. Multi-modal. A **desktop app** - download it and
run models on your own machine.

Run 143+ model families fully on-device (LLMs, VLMs, diffusion, ASR, TTS,
segmentation, detection), and point agent frameworks (LangChain, LangGraph, the
OpenAI SDK) at it the way you point them at Ollama.

## Install

One line in your terminal:

```powershell
# Windows (PowerShell)
irm https://inferml.vercel.app/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://inferml.vercel.app/install.sh | sh
```

The script grabs the latest build for your OS from GitHub Releases and installs
it. Prefer to click? Download it from the
[**Releases**](https://github.com/IMvision12/InferML/releases/latest) page:

| Platform | File |
| --- | --- |
| Windows | `InferML-Setup-<version>.exe` |
| macOS (Apple Silicon) | `InferML-<version>-arm64.dmg` |
| macOS (Intel) | `InferML-<version>-x64.dmg` |
| Linux | `InferML-<version>.AppImage` or `.deb` |

> The builds are not code-signed yet. Downloaded in a browser, Windows
> SmartScreen will say "unknown publisher" (More info → Run anyway) and macOS
> Gatekeeper will need right-click → Open the first time. **The install script
> avoids this on macOS** - a `curl`-fetched file isn't quarantined, so Gatekeeper
> doesn't challenge it.

### Requirements

**Python 3.10 or newer**, already installed and on your PATH. InferML uses it to
build a private environment for the model runtime - it does not touch your
system packages, and it never installs Python for you.

- **Windows** - [python.org](https://www.python.org/downloads/); tick *"Add
  python.exe to PATH"* in the installer.
- **macOS** - `brew install python@3.12`
- **Linux** - `sudo apt install python3 python3-venv`

If Python is missing or too old, the app says so on launch and links you to the
download - nothing else breaks.

## First launch

1. InferML creates its own Python environment (a few seconds, once).
2. It asks whether to install the inference stack for **CPU** or **GPU** and
   fetches the matching PyTorch build. This is a one-time download of ~0.5-2.5 GB,
   with a progress bar.
3. Download a model from the Hub tab and run it.

Everything - the environment, models, chats, settings - lives in the app's data
folder, and nothing is sent anywhere.

## Lives in your tray

InferML sits in the system tray (menu bar on macOS). **Closing the window doesn't
quit it** - the server, your loaded models, and the API keep running, so
`localhost:11500` is simply always there. Getting the window back is one click.

The tray menu has: **Open InferML**, **Copy API base URL**, **Launch at login**,
and **Quit InferML**. Quit is the only thing that actually stops the server and
frees the memory your models are holding.

Turn on *Launch at login* and the API is up before you ever open the app.

## OpenAI-compatible API

InferML serves an OpenAI-compatible API on `http://localhost:11500/v1` (any api
key) for as long as it's running - window open or not. It routes to whichever LLM
is currently loaded.

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:11500/v1", api_key="not-needed")
client.chat.completions.create(
    model="Qwen/Qwen2.5-0.5B-Instruct",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

Supports streaming (`stream=True`), `GET /v1/models`, and tool/function calling
for the Qwen/Hermes, Llama, and Mistral families.

> If port 11500 is already taken, InferML falls back to another port and the
> base URL changes - close the other instance to keep `11500` stable.

## MCP server

Give Claude (or any MCP client) direct access to your local models. The MCP
server talks to the running InferML app over HTTP, so it shares the same warm
models as the app window instead of loading a second copy.

The app writes a launcher into its data folder on every launch. Register it with:

```bash
# macOS
claude mcp add inferml -- \
  "$HOME/Library/Application Support/InferML/venv/bin/python" \
  "$HOME/Library/Application Support/InferML/inferml-mcp.py"

# Linux
claude mcp add inferml -- \
  "$HOME/.config/InferML/venv/bin/python" \
  "$HOME/.config/InferML/inferml-mcp.py"
```

```powershell
# Windows (PowerShell)
claude mcp add inferml -- "$env:APPDATA\InferML\venv\Scripts\python.exe" "$env:APPDATA\InferML\inferml-mcp.py"
```

Keep the InferML app running while you use these tools.

Tools: `detect_objects`, `segment_image`, `generate_image`, `transcribe_audio`,
`text_to_speech`, `generate_text`, `embed_text`, plus `search_models`,
`download_model`, `list_models`, and `inferml_status`.

Media inputs are local file paths. Generated images and audio are written to
`~/inferml-outputs`; images are also returned inline so the model can see what it
made. Full guide, including Claude Desktop setup and troubleshooting:
[MCP.md](MCP.md).

## Updating

The app checks GitHub Releases and updates itself from Settings. Updates replace
the app only - your models and the installed PyTorch stack are left alone, so a
UI fix never costs you a 2 GB re-download.

## Uninstall

Remove the app the normal way for your OS (Add/Remove Programs on Windows, drag
to Trash on macOS, `apt remove inferml` for the .deb, or delete the AppImage).

That leaves your settings and downloaded weights on disk. To wipe those too:

```bash
# macOS
rm -rf ~/Library/Application\ Support/InferML   # env, settings, chats, HF token
rm -rf ~/.cache/huggingface                     # downloaded models (GBs)
rm -rf ~/inferml-outputs                        # MCP-generated images/audio
```

```bash
# Linux
rm -rf ~/.config/InferML
rm -rf ~/.cache/huggingface
rm -rf ~/inferml-outputs
```

```powershell
# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:APPDATA\InferML"
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\huggingface"
Remove-Item -Recurse -Force "$env:USERPROFILE\inferml-outputs"
```

The Hugging Face cache is **shared with every other HF tool** on the machine, so
clearing it makes `transformers`/`diffusers` re-download elsewhere - skip that
line if you'd rather keep the weights. If you set `HF_HOME` or `HF_HUB_CACHE`,
delete those locations instead.

## Development

The app is an Electron shell (`src/main/`) around the Python server
(`python/`). The shell finds a Python, builds a venv in its data folder, starts
the FastAPI server on a loopback port, and points its window at it - so the React
UI in `src/renderer/` is served over HTTP and talks to the backend through
`window.inferml` (`src/renderer/web-bridge.js`), exactly as it would in a browser.

```bash
npm install
npm start            # build the renderer + launch the app
```

Useful pieces:

| Path | What it is |
| --- | --- |
| `src/main/main.js` | boot sequence + window/tray lifecycle |
| `src/main/python-env.js` | Python discovery + the app-managed venv |
| `src/main/sidecar.js` | starts/stops the FastAPI server |
| `src/main/tray.js` | tray icon, close-to-tray, launch at login |
| `python/engine.py` | adapter cache, run/download/unload |
| `python/routing.py` | picks an adapter for a model |
| `python/models/<family>/` | one folder per model family (144 of them) |

Build installers locally:

```bash
npm run dist:win     # or dist:mac / dist:linux  → dist-app/
```

> On Windows, `dist:win` needs **Developer Mode** on (Settings → System → For
> developers). Without it, extracting electron-builder's signing toolchain fails
> on `Cannot create symbolic link` - Windows won't let a normal user create
> symlinks. CI is unaffected.

The server is not a standalone web app: it binds loopback only, has no
authentication, and is started by the shell. Run it directly (`python -m
server.cli --port 11500`) only to debug the backend.
