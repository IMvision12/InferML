# LocalML - Electron → Local Web Server Migration Plan

Status: **planning complete, no code written yet.** This document must be
approved before Phase 1 begins.

---

## 0. Goal (restated)

Remove the signed Electron binary. Ship a **local Python web server** that:

1. Serves the compiled React build as static files at `http://localhost:PORT`.
2. Re-exposes the existing inference backend over HTTP (wrapping, not rewriting,
   the Python inference code).
3. Adds an **OpenAI-compatible API** (`/v1/chat/completions`, `/v1/models`,
   SSE streaming, tool calling) so LangChain / LangGraph / the OpenAI SDK can
   point at LocalML the way they point at Ollama.

Install path becomes: `pipx install localml` → run `localml` → open the printed
URL. No Node, no native binary, native GPU/MPS preserved.

---

## 1. Current architecture (what exists today)

Three layers, two process boundaries:

```
┌─────────────────────────── Electron app ───────────────────────────┐
│                                                                     │
│  React renderer (classic scripts, window.localml.* IPC)             │
│      src/renderer/components/*.jsx  +  index.html  +  styles.css     │
│                         │  contextBridge (preload.js)               │
│                         ▼                                            │
│  Electron main process (Node)                                       │
│      src/main/ipc/*.js         ← IPC handlers                       │
│      src/main/services/*.js    ← hf, storage, systeminfo, updates…  │
│                         │  spawn + stdin/stdout JSON                 │
└─────────────────────────┼──────────────────────────────────────────┘
                          ▼
          Python inference sidecar (long-lived subprocess)
              python/runner.py  ← NDJSON request/response loop
              python/routing.py ← tiered adapter router
              python/adapters/  ← StandardPipeline, Diffusers, base
              python/models/    ← 143 per-family folders
              python/tasks/     ← per-task handlers (text-gen, ASR, …)
```

### 1a. The Python inference contract (the part we keep)

`python/runner.py` reads newline-delimited JSON on stdin, writes NDJSON on
stdout. The core logic is small and clean:

| stdin request | fields | stdout response |
|---|---|---|
| `{type:"ping"}` | - | `{type:"pong"}` |
| `{type:"run"}` | `modelId`, `task`, `input:{kind,text?,dataUrl?,points?}`, `params` | `{type:"result", output:{kind,...}}` or `{type:"error", error, exc_type, trace}` |
| `{type:"download"}` | `modelId` | streamed `{type:"progress", done,total,pct,final}` then `{type:"result", output:{path,bytes,total_bytes}}` |
| `{type:"cancelDownload"}` | `targetId` | `{type:"result", output:{cancelled}}` |

Key functions we will **reuse verbatim** by extracting them into an importable
engine (see §2):

- `runner._run(req)` → `inspect_model` → `pick_adapter` → `adapter.load` →
  `adapter.run(inputs, params)`. Adapter instances cached in
  `_ADAPTER_CACHE` keyed by `(adapter_class, model_id)` - **one model = one
  loaded pipeline**, exactly the handle the OpenAI endpoint needs.
- `runner._download(req, cancel_event)` → `snapshot_download` with per-format
  filtering + byte-progress via a custom tqdm.
- `routing.pick_adapter` / `inspect_model` / `override_for` - unchanged.
- `output_kinds.py` canonical shapes: `text | image | audio | boxes | masks |
  labels | vector`.

LLM text generation path (relevant to Phase 3/4):
`models/{qwen,llama,gemma,mistral}/` → `make_pipeline_adapter("text-generation")`
→ `tasks/text_generation.py`. The loaded `LoadedPipeline.pipe` is a transformers
`pipeline`, so `state.pipe.model` and `state.pipe.tokenizer` are directly
reachable - that is what `/v1/chat/completions` will drive (streamer + chat
template + `model.generate`).

### 1b. The frontend IPC surface (`window.localml.*`)

Enumerated from the renderer (only these are actually consumed - `chat.send`
cloud-provider streaming and `keys.*` are exposed by preload but **unused** by
the current components, so they are out of scope):

| namespace | methods used by renderer |
|---|---|
| `tasks` | `run`, `download`, `cancelDownload`, `stop`, `status`, `statusSync`, `setup`, `onDownloadProgress`, `onSetupProgress` |
| `hf` | `search`, `installed`, `markInstalled`, `uninstall`, `modelInfo`, `getToken`/`setToken`/`clearToken`/`verifyToken`, `onInstallsChanged` |
| `chats` | `list`, `get`, `save`, `patch`, `delete`, `onUpdate` |
| `settings` | `get`, `save` |
| `hw` | `get`, `subscribe` |
| `dialog` | `openImage`, `openAudio` |
| `storage` | `size`, `clearHfCache`, `clearPyRuntime` |
| `logs` | `view`, `path` |
| `app` | `version`, `openExternal` |
| `updates` | `check`, `download`, `install` (+ events) |
| `window` | `minimize`, `maximize`, `close`, `isMaximized`, `onState` |

The inference request shape the renderer sends (from `task-workspace.jsx` and
`chat.jsx`) is exactly the sidecar `run` payload, wrapped by the IPC handler as
`{ok:true, output}` / `{ok:false, error}`.

---

## 2. Target architecture

```
        Browser (unchanged React components)
   src/renderer/**  →  window.localml.*  (NEW: web-bridge.js, fetch/SSE)
                         │  HTTP / SSE (same origin, localhost)
                         ▼
        FastAPI + uvicorn  (python/server/app.py)  ← runs natively
           ├── StaticFiles  → serves compiled React build at "/"
           ├── /api/*        → inference, hf, chats, settings, hw, logs
           └── /v1/*         → OpenAI-compatible (chat/completions, models)
                         │  in-process function call (no subprocess)
                         ▼
        Inference engine  (python/engine.py - extracted from runner.py)
           routing.py · adapters/ · models/ · tasks/   ← REUSED UNCHANGED
```

### Key decisions

1. **In-process engine, not a subprocess.** The server imports the inference
   engine directly. Rationale: (a) the OpenAI endpoint needs a live handle to
   the currently-loaded LLM adapter/tokenizer - trivial in-process, awkward over
   stdio; (b) SSE token streaming wants the `TextIteratorStreamer` in the same
   process; (c) native GPU/MPS is preserved because uvicorn runs Python
   natively. `runner.py` stays as a thin CLI shim over the same engine for
   back-compat and the existing `_test_*` harnesses.

2. **Serialize inference; run it off the event loop.** Today the sidecar
   processes one request at a time. We keep that: a module-level `asyncio.Lock`
   (or an inference queue) guards model load + generate, and blocking work runs
   in `run_in_executor` so the event loop stays responsive for progress polling
   and health checks. Prevents torch re-entrancy and OOM from concurrent loads.

3. **Frontend stays byte-for-byte unchanged; only the bridge changes.** A new
   `src/renderer/web-bridge.js` defines `window.localml` with the same shape,
   backed by `fetch` + `EventSource`. It is loaded by `index.html` *before* the
   component scripts, replacing the Electron `preload.js`. This satisfies the
   "leave UI and components unchanged" constraint - not one `.jsx` is edited for
   Phase 2 behavior.

4. **Electron-only services get Python equivalents** (hf search, storage, hw,
   logs). They already have a clear reference implementation in `src/main/…`;
   we port the logic, not invent new behavior.

5. **App-data location** via `platformdirs` (`localml`): chats/, settings.json,
   installs.json, hf-token.json, logs/. `HF_HOME` defaults to the standard HF
   cache unless the user sets it - no more bespoke `userData/hf-cache`.

### New files

```
python/
  engine.py                 # extracted run/download/adapter-cache + "current LLM" handle
  server/
    __init__.py
    app.py                  # FastAPI app factory: static + routers
    cli.py                  # console_scripts entry → uvicorn.run
    deps.py                 # shared engine singleton, inference lock, paths
    routes/
      inference.py          # /api/run, /api/download (SSE), /api/models load/unload
      hf.py                 # /api/hf/search, installed, modelInfo, token
      store.py              # /api/chats, /api/settings
      system.py             # /api/hw, /api/logs, /api/status, /api/app
    openai/
      __init__.py
      routes.py             # /v1/chat/completions, /v1/models
      adapt.py              # OpenAI request↔internal, response/chunk builders
      streaming.py          # TextIteratorStreamer → SSE
      tools/
        __init__.py         # family detection + dispatch
        base.py             # ToolParser ABC, tool_calls schema
        hermes_qwen.py      # <tool_call>{...}</tool_call>
        llama.py            # <|python_tag|> / JSON
        mistral.py          # [TOOL_CALLS] [...]
    hf_service.py           # Python port of services/huggingface.js
    store_service.py        # chats/settings/installs persistence
    hw_service.py           # psutil + torch/nvidia-smi hardware sample
  pyproject.toml            # pipx-installable package, console_scripts=localml
  Dockerfile                # optional container
src/renderer/
  web-bridge.js             # NEW window.localml over fetch/SSE (replaces preload)
```

---

## 3. Phase 1 - FastAPI server that serves the frontend

**Deliverables**
- `python/server/app.py`: FastAPI app. Mounts `StaticFiles` at `/` pointing at
  the compiled renderer dir (`src/renderer/dist` in dev; packaged data dir in
  prod). SPA fallback so unknown non-`/api`, non-`/v1` paths return `index.html`.
- `python/server/cli.py`: `localml` entry point. Flags: `--port` (default
  **11500**), `--host` (default `127.0.0.1`), `--no-browser`. Starts uvicorn,
  prints `LocalML → http://localhost:11500`, optionally opens the browser.
- `GET /api/health` → `{ok:true}`.
- Vendored browser deps: extend `scripts/build-renderer.js` to copy
  `react`, `react-dom`, `marked`, `dompurify` UMD bundles into
  `dist/vendor/` and rewrite the `<script src="../../node_modules/…">` tags to
  `/vendor/…`. Removes the runtime dependency on `node_modules` being present,
  which is required for a Node-free install.

**Verification**: `localml` starts; browser at `:11500` loads the LocalML shell
(titlebar, sidebar, hub) with no console errors for static assets. (Inference
still 404s until Phase 2 - expected.)

---

## 4. Phase 2 - port the sidecar contract to HTTP

**4a. Extract the engine (`python/engine.py`)**
Move `_ADAPTER_CACHE`, `_get_adapter`, `_run`, `_download` (+ the weight-format
picker and `_actionable_error`) out of `runner.py` into `engine.py` as a small
class `Engine` with:
- `run(model_id, task, inputs, params) -> dict` (returns an `output_kinds` dict)
- `download(model_id, on_progress, cancel_event) -> dict`
- `current_llm()` / `loaded_models()` - exposes the cached text-generation
  adapter(s) for Phase 3.
- `unload(model_id=None)`.
`runner.py` becomes a thin NDJSON shim that calls `Engine`. **No adapter, model,
or task code changes** - this is pure extraction (constraint: wrap, don't
rewrite).

**4b. Inference routes (`routes/inference.py`)**
| method + path | replaces IPC | shape |
|---|---|---|
| `POST /api/run` | `tasks:run` | body `{task,modelId,input,params}` → `{ok,output}` / `{ok,error}` |
| `POST /api/download` | `tasks:download` | body `{modelId}` → **SSE** stream of `{done,total,pct,final}`, terminal `{ok,info}` |
| `POST /api/download/cancel` | `tasks:cancelDownload` | `{modelId}` |
| `POST /api/stop` | `tasks:stop` | cancels in-flight run |
| `GET /api/status` | `tasks:status`/`statusSync` | `{ready:true, runtimeInstalled:true, ...}` - in the pipx model the server *is* the runtime, so this is a lightweight torch/accel probe, and `setup` is a no-op returning ready. Onboarding auto-advances. |

Inference runs under the shared lock in a threadpool. Download progress uses an
`asyncio.Queue` fed by the engine's `on_progress` callback and drained as SSE.

**4c. Port the Electron-only services to Python**
- `hf_service.py` ← `services/huggingface.js`: `search` (HF list API +
  `isNativelySupported` filter using the existing
  `python/supported_architectures.json`), `listInstalled`, `markInstalled`,
  `uninstall` (+ cache delete), `modelInfo`. Exposed at `/api/hf/*`.
- `store_service.py` ← `services/storage.js` + `ipc/chats.js` + `ipc/settings.js`:
  chats CRUD (`/api/chats`), settings (`/api/settings`), installs.json. Same
  validation (chat-id allow-list, protected/metadata fields).
- `hw_service.py` ← `services/systeminfo.js`: `psutil` for CPU/mem/disk,
  `nvidia-smi`/`torch.cuda`/`torch.backends.mps` for GPU. `/api/hw`.
- HF token ← `services/hf-auth.js`: `/api/hf/token` get/set/clear/verify; set
  updates the process env (`HF_TOKEN`) so the in-process engine picks it up on
  the next load - no process restart needed (an advantage of in-process).
- logs: in-memory ring + append file; `/api/logs`.

**4d. The web bridge (`src/renderer/web-bridge.js`)**
Reimplements the full `window.localml.*` surface (§1b) over HTTP:
- `tasks.run` → `POST /api/run`. `tasks.download` → SSE, re-dispatched to
  `onDownloadProgress` subscribers (preserves the existing progress-callback
  API). `tasks.status/statusSync` → `/api/status` (statusSync returns a cached
  last value synchronously via a warmed fetch at boot).
- `hf.*`, `chats.*`, `settings.*`, `hw.*` → their `/api/*` routes. `hw.subscribe`
  and `chats.onUpdate` / `hf.onInstallsChanged` → `EventSource('/api/events')`
  (server-sent broadcast) so live hardware polling and cross-tab install updates
  keep working.
- `dialog.openImage/openAudio` → programmatic `<input type=file>` in the browser
  that reads the file to a data URL and returns `{kind,dataUrl,name}` - the
  exact shape components expect. No component edit needed.
- `window.*`, `updates.*`, `app.openExternal` → browser-appropriate stubs
  (`window.close`→ no-op/hide titlebar controls, `openExternal`→`window.open`).
- `index.html`: replace the preload's role by adding
  `<script src="/web-bridge.js"></script>` before the component scripts.

**Verification (Phase 1+2)**: fresh `localml`, UI loads in a browser; download a
model from the Hub with a live progress bar; run **one model of each major
type** end-to-end - LLM (Qwen/Llama text-gen), VLM (image-text-to-text),
diffusion (text-to-image), ASR (Whisper) - outputs render in the workspace.

---

## 5. Phase 3 - OpenAI-compatible endpoint

**`POST /v1/chat/completions`** (`openai/routes.py` + `adapt.py`)
- Accept the standard body: `model, messages[], temperature, top_p, max_tokens,
  stream, stop, tools, tool_choice`.
- Resolve the target LLM: if `model` names a loaded/installed text-gen model use
  it (lazy-load via engine if installed); otherwise route to
  `engine.current_llm()`. If no LLM is loaded and none named → `400` with a
  clear "load a text-generation model in LocalML first" message.
- Build the prompt with `tokenizer.apply_chat_template(messages,
  add_generation_prompt=True)` (full multi-turn - an improvement over the
  current single-user-message path, reusing the same tokenizer).
- Non-stream: `model.generate` in the executor under the lock; map to the
  OpenAI response object (`id, object:"chat.completion", choices[0].message,
  usage{prompt_tokens,completion_tokens,total_tokens}`, `finish_reason`).
- **Stream** (`streaming.py`): `TextIteratorStreamer` + a worker thread running
  `generate`; yield `data: {chat.completion.chunk}` SSE frames with
  `choices[0].delta`, terminate with `finish_reason` then `data: [DONE]`.

**`GET /v1/models`** → OpenAI list shape (`{object:"list", data:[{id, object:
"model", owned_by:"localml", created}]}`) from currently-loaded + installed LLMs.

**Verification**: point a LangChain `ChatOpenAI(base_url="http://localhost:11500/v1",
api_key="not-needed")` at a loaded Qwen/Llama; a simple `.invoke()` and a
streamed call both return valid content.

---

## 6. Phase 4 - tool calling (flagged as model-specific complexity)

Tool calling is **not uniform across model families** - this is the genuinely
hard phase and is built explicitly, never faked.

- Request: accept `tools` (+ `tool_choice`). Apply the chat template *with tools*
  (`apply_chat_template(messages, tools=tools, add_generation_prompt=True)`),
  which injects each family's native tool preamble.
- Parse generated text back into structured `tool_calls[]` via a **parser layer
  keyed on model family**, not one regex:
  - `hermes_qwen.py` - `<tool_call>{"name":…,"arguments":…}</tool_call>` (Qwen2.5/3,
    Hermes). Start here - Qwen is among LocalML's most-loaded families.
  - `llama.py` - Llama 3.1/3.2: `<|python_tag|>`-prefixed or bare JSON
    `{"name":…,"parameters":…}`.
  - `mistral.py` - `[TOOL_CALLS] [ {…} ]`.
- Family detection from `config.model_type` / tokenizer name → dispatch in
  `tools/__init__.py`.
- Response: emit `choices[0].message.tool_calls[]` with
  `finish_reason:"tool_calls"`; ids like `call_<rand>`; stringified `arguments`
  per spec. Feed `role:"tool"` results back on the next turn.
- **Unknown family → HTTP 422 / explicit error**, never silent mis-parse
  (constraint).

**Verification**: an agent (LangChain tool-calling or raw OpenAI SDK) completes a
full round trip - model emits a tool call, we parse it, the caller runs the tool
and posts the result, the model produces a final answer - against a Qwen model.

---

## 7. Phase 5 - distribution

- `pyproject.toml`: package `localml`; `console_scripts` `localml =
  localml.server.cli:main`; deps = current `requirements.txt` + `fastapi`,
  `uvicorn[standard]`, `psutil`, `platformdirs`, `huggingface_hub`. torch stays
  an install-time concern: document `pipx install localml` for CPU and an extra
  index (`--pip-args='--index-url …cu124'`) or an optional extra for GPU, mirroring
  today's accelerator logic. **Model coverage is unchanged - same transformers/
  diffusers/timm stack, all 143 families intact.**
- **Bundle the built frontend inside the package**: `build:renderer` output is
  included as package data (e.g. `python/localml/webui/`) so a fresh install
  needs no Node. A small `MANIFEST.in`/`tool.setuptools.package-data` entry.
- `Dockerfile` (optional): python base, `pip install .`, `EXPOSE 11500`,
  `CMD ["localml","--host","0.0.0.0"]`.
- **Remove Electron** once the web path is verified end-to-end: delete
  `src/main/**`, `scripts/build-icons.js`, `scripts/dev.js`, `electron*` +
  `systeminformation` deps, and the `build`/`dist:*` scripts + `electron-builder`
  config in `package.json`. **Keep** `src/renderer/**` (React source) and a
  slimmed `package.json` whose only job is building the renderer (`esbuild`,
  `react`, `marked`, `dompurify`). `preload.js` is superseded by `web-bridge.js`.

---

## 8. Constraints compliance

| Constraint | How it's met |
|---|---|
| No coverage reduction (143 families) | `routing/adapters/models/tasks` reused unchanged; engine is pure extraction |
| Native GPU/MPS | uvicorn runs Python natively; `io_utils.resolve_device` unchanged; no sandbox |
| Fully local, no outbound calls, no API keys required | Server binds `127.0.0.1`; only HF calls are the pre-existing model search/download; no key needed for `/v1` |
| UI served same-origin as API | StaticFiles + `/api` + `/v1` all on one uvicorn origin → no mixed content, no CORS needed for the app |
| Leave UI/components unchanged (Phase 2) | Only `web-bridge.js` + `index.html` script tag change; `.jsx` untouched |
| Wrap, don't rewrite inference | Engine extraction only; adapters/tasks/models byte-identical |

---

## 9. Risks & mitigations

- **Concurrency / torch re-entrancy** → single inference lock + executor;
  mirrors current one-at-a-time sidecar semantics.
- **`statusSync` was synchronous IPC** used on first paint → web-bridge warms a
  `/api/status` fetch at load and serves the cached value synchronously; the
  onboarding gate treats the server as already-ready so no flash.
- **Chat template lacks a tool format for some families** → Phase 4 returns an
  explicit error rather than guessing; ship Qwen/Llama/Mistral first, expand.
- **Vendored UMD deps** must ship without `node_modules` → copied into
  `dist/vendor` at build and packaged as data.
- **Streaming + `stop`** → cancel via an `Event` checked by the streamer thread,
  reusing the download-cancellation pattern already in `runner.py`.
- **Windows path/symlink quirks** → `_win_compat` already imported by the engine
  path; keep it.

---

## 10. Verification matrix (run after each phase)

| Phase | Check |
|---|---|
| 1 | `localml` serves UI at `:11500`, static assets load, no Node needed to serve |
| 2 | download w/ progress; LLM + VLM + diffusion + ASR each run end-to-end in-browser |
| 3 | LangChain `ChatOpenAI` non-stream + stream against a loaded LLM |
| 4 | full agent tool-call round trip on Qwen; unknown-family model returns a clear error |
| 5 | `pipx install .` in a clean env → `localml` runs; Docker image serves; Electron removed, renderer still builds |

---

## Work order

Phase by phase, verifying before moving on. After each phase: a short summary of
what changed and what was verified. No git operations are performed by the
assistant - the user runs all commits/pushes.
