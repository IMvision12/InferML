const { useState: useStateMB, useEffect: useEffectMB, useMemo: useMemoMB, useRef: useRefMB } = React;

const HUB_TASKS = [
  { id: 'all',          nm: 'All',          task: null,                           ic: 'cube'     },
  { id: 'vlm',          nm: 'VLM',          task: 'image-text-to-text',           ic: 'chat'     },
  { id: 'text',         nm: 'Text',         task: 'text-generation',              ic: 'chat'     },
  { id: 'segmentation', nm: 'Segmentation', task: 'image-segmentation',           ic: 'eye'      },
  { id: 'sam',          nm: 'SAM',          task: 'mask-generation',              ic: 'sparkle'  },
  { id: 'detection',    nm: 'Detection',    task: 'object-detection',             ic: 'target'   },
  { id: 'classify',     nm: 'Classify',     task: 'image-classification',         ic: 'eye'      },
  { id: 'diffusion',    nm: 'Diffusion',    task: 'text-to-image',                ic: 'sparkle'  },
  // ↑ default-visible 8. "+ more" reveals the rest below.
  { id: 'depth',        nm: 'Depth',        task: 'depth-estimation',             ic: 'layers'   },
  { id: 'docs',         nm: 'Docs / OCR',   task: 'document-question-answering',  ic: 'file'     },
  { id: 'asr',          nm: 'ASR',          task: 'automatic-speech-recognition', ic: 'waveform' },
  { id: 'tts',          nm: 'TTS',          task: 'text-to-speech',               ic: 'waveform' },
];

// Popular model families. Clicking one drops its search keyword into the
// query box (which is already debounced). First N rendered by default;
// "+ more" reveals the rest.
const MODEL_FAMILIES = [
  { nm: 'Llama',     q: 'llama' },
  { nm: 'Qwen',      q: 'qwen' },
  { nm: 'Mistral',   q: 'mistral' },
  { nm: 'Gemma',     q: 'gemma' },
  { nm: 'Phi',       q: 'phi' },
  { nm: 'DeepSeek',  q: 'deepseek' },
  { nm: 'Florence',  q: 'florence' },
  { nm: 'LLaVA',     q: 'llava' },
  // ↑ default-visible 8.
  { nm: 'Moondream', q: 'moondream' },
  { nm: 'PaliGemma', q: 'paligemma' },
  { nm: 'SmolVLM',   q: 'smolvlm' },
  { nm: 'Whisper',   q: 'whisper' },
  { nm: 'Parakeet',  q: 'parakeet' },
  { nm: 'DETR',      q: 'detr' },
  { nm: 'YOLOS',     q: 'yolos' },
  { nm: 'RT-DETR',   q: 'rt-detr' },
  { nm: 'SAM',       q: 'sam-vit' },
  { nm: 'BLIP',      q: 'blip' },
  { nm: 'TrOCR',     q: 'trocr' },
  { nm: 'ViT',       q: 'vit' },
  { nm: 'CLIP',      q: 'clip' },
  { nm: 'SigLIP',    q: 'siglip' },
  { nm: 'SD',        q: 'stable-diffusion' },
  { nm: 'FLUX',      q: 'flux' },
  { nm: 'SpeechT5',  q: 'speecht5' },
  { nm: 'Bark',      q: 'bark' },
];

// Modalities we sample for the "Suggested for you" list. One popular model
// per category gives the user a varied, modality-spanning starter set.
const SUGGEST_TASKS = [
  'image-text-to-text',
  'text-generation',
  'automatic-speech-recognition',
  'object-detection',
  'mask-generation',
  'image-classification',
];

// Models above this size are excluded from suggestions (~most user GPUs).
const SUGGEST_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

// Parse "1.2 GB" / "462 MB" / "150 MB" / "-" → bytes (NaN means unknown).
function _parseSize(s) {
  if (!s || typeof s !== 'string') return NaN;
  const m = s.match(/^([\d.]+)\s*([KMGT]?B)$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mul = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] || 1;
  return n * mul;
}

function _formatLandingDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

// Tasks our runtime can actually execute. Kept in sync with python/tasks/ +
// the DiffusersAdapter. Models with any other pipeline_tag are hidden from
// the Hub until we add a handler for them.
const SUPPORTED_TASKS = new Set([
  // standard pipeline
  'image-text-to-text',
  'text-generation',
  'translation',
  'summarization',
  'text2text-generation',
  'image-segmentation',
  'mask-generation',
  'object-detection',
  'zero-shot-object-detection',
  'image-classification',
  'zero-shot-image-classification',
  'image-to-text',
  'depth-estimation',
  'document-question-answering',
  'automatic-speech-recognition',
  'text-to-speech',
  // diffusers
  'text-to-image',
  'image-to-image',
  // 'inpainting' is intentionally omitted — the diffusers pipeline requires a
  // mask (see python/adapters/diffusers_pipeline.py:55) and we don't ship a
  // mask editor yet. Re-enable once a mask canvas is wired into the composer.
]);

// The main-process huggingface service filters results through
// isNativelySupported() before returning — repos tagged ultralytics / YOLO /
// RF-DETR / detectron2 / PaddleOCR / keras / onnx-only never reach the
// renderer, so the only client-side filter we need is task-based (the "All"
// tab sends task=null to the server, so we still have to drop models whose
// pipeline_tag has no workspace on our side).

function ModelHub({ hw, onOpenModel, onOpenSettings, defaultInstalled = false, resetSignal = 0 }) {
  const [tab, setTab] = useStateMB('all');
  const [query, setQuery] = useStateMB('');
  // Debounced copy of `query` — what drives the actual HF search. Prevents
  // every keystroke from firing 2 HF API calls.
  const [debouncedQuery, setDebouncedQuery] = useStateMB('');
  const [showInstalled, setShowInstalled] = useStateMB(defaultInstalled);
  // Sync showInstalled when the parent (App) toggles it via the sidebar buttons.
  useEffectMB(() => { setShowInstalled(defaultInstalled); }, [defaultInstalled]);
  // Parent bumps `resetSignal` whenever the user clicks the sidebar Home
  // button. Clear the active category + search so the landing view ("What
  // would you like to run today?") reappears regardless of where the user
  // was. The initial 0 → no-op render is filtered by the !== 0 guard.
  useEffectMB(() => {
    if (resetSignal === 0) return;
    setTab('all');
    setQuery('');
    setDebouncedQuery('');
  }, [resetSignal]);
  // Full HF list per sampled modality, fetched once. Picks are derived from
  // this pool + the live `installed` state, so installing a suggested model
  // immediately backfills the row from the next-best candidate without
  // hitting HF again.
  const [suggestedPool, setSuggestedPool] = useStateMB({}); // { task -> Model[] }
  const [suggestedSizes, setSuggestedSizes] = useStateMB({}); // { id -> "1.6 GB" }
  const [suggestedLoading, setSuggestedLoading] = useStateMB(true);
  const [results, setResults] = useStateMB([]);
  const [loading, setLoading] = useStateMB(false);
  const [err, setErr] = useStateMB(null);
  const [installed, setInstalled] = useStateMB({});
  const [downloads, setDownloads] = useStateMB({});
  const [sizeMap, setSizeMap] = useStateMB({}); // id -> { size, bytes, hw }
  const dlTimers = useRefMB({});

  const refreshInstalled = async () => {
    try { setInstalled((await window.localml.hf.installed()) || {}); } catch {}
  };

  useEffectMB(() => { refreshInstalled(); }, []);
  // Stay in sync with installs.json mutations from any source: a finishing
  // download in the Hub, an Uninstall click, the boot reconcile, or the
  // Settings → Storage Clean button. Without this, the Installed list and
  // any "Installed" badges go stale until the user navigates away and back.
  useEffectMB(() => {
    const off = window.localml?.hf?.onInstallsChanged?.(() => refreshInstalled());
    return () => { try { off && off(); } catch {} };
  }, []);

  // Fetch the suggested-pool ONCE per Hub mount. One HF query per sampled
  // modality, store the full top-N list per task. Picks are derived later
  // (so installing a suggested model promotes the next candidate from the
  // same pool without a re-fetch).
  useEffectMB(() => {
    let cancelled = false;
    (async () => {
      setSuggestedLoading(true);
      const lists = await Promise.allSettled(
        SUGGEST_TASKS.map(t => window.localml.hf.search('', t))
      );
      if (cancelled) return;
      const pool = {};
      for (let i = 0; i < lists.length; i++) {
        const r = lists[i];
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          pool[SUGGEST_TASKS[i]] = r.value;
        }
      }
      if (cancelled) return;
      setSuggestedPool(pool);
      setSuggestedLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Derive the visible picks: one per modality, skipping installed/oversized,
  // capped to 5. Recomputes whenever the user installs/uninstalls a model.
  const suggestedList = useMemoMB(() => {
    const picks = [];
    const seen = new Set();
    for (const task of SUGGEST_TASKS) {
      const list = suggestedPool[task] || [];
      const pick = list.find(m => {
        if (!m.id || seen.has(m.id)) return false;
        if (installed[m.id]) return false;
        const sz = suggestedSizes[m.id] || m.size;
        const bytes = _parseSize(sz);
        if (Number.isFinite(bytes) && bytes > SUGGEST_MAX_BYTES) return false;
        return true;
      });
      if (pick) {
        // Apply any resolved size from suggestedSizes onto the pick.
        const finalSize = suggestedSizes[pick.id] || pick.size;
        picks.push({ ...pick, size: finalSize });
        seen.add(pick.id);
      }
      if (picks.length >= 5) break;
    }
    return picks;
  }, [suggestedPool, suggestedSizes, installed]);

  // Lazy-resolve sizes for any pick whose size is missing or "-". Reuses the
  // same modelInfo IPC the search grid uses. Patches the suggestedSizes map
  // so suggestedList re-derives with real sizes.
  useEffectMB(() => {
    let cancelled = false;
    (async () => {
      const needSize = suggestedList.filter(p => !p.size || p.size === '-' || p.size === '—');
      if (needSize.length === 0) return;
      const CONCURRENCY = 3;
      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < needSize.length) {
          const m = needSize[cursor++];
          if (suggestedSizes[m.id]) continue; // already resolved
          try {
            const info = await window.localml?.hf.modelInfo(m.id);
            if (cancelled || !info?.size) continue;
            setSuggestedSizes(prev => ({ ...prev, [m.id]: info.size }));
          } catch { /* ignore — leave size as "-" */ }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    })();
    return () => { cancelled = true; };
  }, [suggestedList]);

  // Debounce search input — no sense firing an HF request for every keystroke
  // of a word the user is still typing. 300ms is the common UX default.
  useEffectMB(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Stream real-time download progress from the python sidecar.
  useEffectMB(() => {
    const off = window.localml?.tasks.onDownloadProgress((evt) => {
      if (!evt || !evt.modelId) return;
      const { modelId, pct, done, total, final } = evt;
      setDownloads(d => {
        // Only merge into an entry we already created in startDownload —
        // stray events for dismissed/completed entries are ignored.
        if (!d[modelId]) return d;
        return {
          ...d,
          [modelId]: {
            ...d[modelId],
            pct: typeof pct === 'number' ? pct : d[modelId].pct,
            done: typeof done === 'number' ? done : d[modelId].done,
            total: typeof total === 'number' ? total : d[modelId].total,
            final: !!final || !!d[modelId].final,
          },
        };
      });
    });
    return () => { if (off) off(); };
  }, []);

  // Whether to actually hit HF. We keep the model grid hidden until the user
  // has expressed intent: typed something, picked a non-"all" modality, or
  // toggled the Installed-only view. This prevents a giant pre-populated
  // wall of random checkpoints on first load.
  const hasActiveFilter = (
    showInstalled
    || debouncedQuery.trim().length > 0
    || (tab && tab !== 'all')
  );

  useEffectMB(() => {
    if (!hasActiveFilter) {
      setResults([]);
      setLoading(false);
      setErr(null);
      return;
    }
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        if (showInstalled) {
          const inst = (await window.localml.hf.installed()) || {};
          const ids = Object.keys(inst);
          const collected = [];
          for (const id of ids) {
            const sub = await window.localml.hf.search(id.split('/').pop(), null);
            if (Array.isArray(sub)) {
              const match = sub.find(m => m.id === id);
              if (match) collected.push({ ...match, installed: true });
              else collected.push({ id, nm: id.split('/').pop(), path: id, task: inst[id]?.task, size: inst[id]?.size, installed: true });
            }
          }
          if (!cancelled) setResults(collected);
        } else {
          const sel = HUB_TASKS.find(t => t.id === tab);
          const r = await window.localml.hf.search(debouncedQuery.trim(), sel?.task || null);
          if (Array.isArray(r)) {
            if (!cancelled) setResults(r);
          } else {
            // IPC returned {error: ...} — surface the error and keep the
            // previous result set visible so the grid doesn't collapse to
            // "No results." on a transient failure.
            if (!cancelled) setErr(r?.error || 'search failed');
          }
        }
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, [tab, debouncedQuery, showInstalled]);

  const allModels = useMemoMB(() =>
    results.map(m => {
      const entry = sizeMap[m.id];
      const fetched = entry && entry.fetched;
      const originalSize = m.size && m.size !== '-' ? m.size : null;
      const size = (entry?.size) || originalSize;
      return {
        ...m,
        installed: !!installed[m.id],
        size,
        sizeFetched: !!fetched || !!originalSize,
        bytes: entry?.bytes || 0,
        hw: entry?.hw || m.hw,
      };
    }),
    [results, installed, sizeMap]);

  // Server-side filter already excludes non-transformers/diffusers runtimes.
  // Only drop models whose task we have no workspace for (relevant on the
  // "All" tab, which doesn't pass a pipeline_tag filter to the server).
  const models = useMemoMB(
    () => allModels.filter(m => m.installed || SUPPORTED_TASKS.has(m.task)),
    [allModels]
  );
  const hiddenCount = allModels.length - models.length;

  // Lazy-fetch sizes for any result missing one (4-way concurrency).
  // Skip models whose task we don't support — saves HF API calls.
  useEffectMB(() => {
    let cancelled = false;
    (async () => {
      const ids = results
        .filter(m => SUPPORTED_TASKS.has(m.task))
        .filter(m => !m.size || m.size === '-')
        .map(m => m.id)
        .filter(id => !(id in sizeMap));
      if (!ids.length) return;

      const CONCURRENCY = 4;
      let cursor = 0;
      const worker = async () => {
        while (!cancelled && cursor < ids.length) {
          const id = ids[cursor++];
          try {
            const info = await window.localml?.hf.modelInfo(id);
            if (cancelled) return;
            setSizeMap(prev => ({
              ...prev,
              [id]: { fetched: true, size: info?.size || null, bytes: info?.bytes || 0, hw: info?.hw },
            }));
          } catch {
            if (!cancelled) setSizeMap(prev => ({ ...prev, [id]: { fetched: true, size: null, bytes: 0 } }));
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    })();
    return () => { cancelled = true; };
  }, [results]);

  const startDownload = async (m) => {
    if (downloads[m.id]) return;
    setDownloads(d => ({ ...d, [m.id]: { status: 'downloading', size: m.size } }));
    try {
      const res = await window.localml.tasks.download(m.id);
      if (!res?.ok) {
        const msg = res?.error || 'download failed';
        // User dismissed → entry already removed; don't resurrect it as "failed".
        setDownloads(d => d[m.id]
          ? { ...d, [m.id]: { status: 'error', error: msg } }
          : d);
        return;
      }
      await window.localml.hf.markInstalled(m.id, { task: m.task, size: m.size, nm: m.nm, localPath: res.info?.path });
      await refreshInstalled();
      setDownloads(d => { const rest = { ...d }; delete rest[m.id]; return rest; });
    } catch (e) {
      setDownloads(d => d[m.id]
        ? { ...d, [m.id]: { status: 'error', error: String(e?.message || e) } }
        : d);
    }
  };
  const cancelDownload = async (id) => {
    // Remove from UI immediately so the user sees the action take effect.
    setDownloads(d => { const rest = { ...d }; delete rest[id]; return rest; });
    // Then tell the Python sidecar to unwind the in-flight snapshot_download.
    // Fire-and-forget — the matching startDownload promise will reject with
    // "cancelled", and its guarded setDownloads call above is a no-op since
    // the entry is already gone.
    try { await window.localml?.tasks.cancelDownload(id); } catch {}
  };
  const uninstall = async (id) => {
    await window.localml.hf.uninstall(id);
    refreshInstalled();
  };

  const installedCount = Object.keys(installed).length;
  const activeDownloads = Object.keys(downloads).length;

  // Build an array of installed models for the landing column. Prefer the
  // metadata in installs.json (fast, local) over re-querying HF. Sorted by
  // most recent install and capped at 5 so the landing fits one viewport;
  // the full list is reachable via the "Installed only" toggle.
  const installedList = Object.entries(installed)
    .map(([id, m]) => ({
      id,
      nm: m.nm || id.split('/').pop(),
      owner: id.split('/')[0],
      task: m.task || '',
      size: m.size || '',
      installedAt: m.installedAt || 0,
    }))
    .sort((a, b) => b.installedAt - a.installedAt)
    .slice(0, 5);


  return (
    <div className={`hub ${!hasActiveFilter ? 'hub-idle' : ''}`}>
      {!hasActiveFilter ? (
        <div className="hub-landing">
          <div className="hub-landing-eyebrow">{_formatLandingDate()}</div>
          <h1 className="hub-landing-title">What would you like to run today?</h1>
          <p className="hub-landing-sub">Pick from your library, browse the Hub, or paste a model id.</p>

          <div className="hub-search-row hub-landing-search">
            <div className="hub-search">
              <Icon name="search" size={14} style={{color:'var(--fg-3)'}}/>
              <input
                placeholder="Search a task, family, or paste an HF id…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
              {query && <button className="hub-search-clear" onClick={() => setQuery('')}><Icon name="x" size={11}/></button>}
            </div>
          </div>

          <div className="hub-tag-list hub-landing-tags">
            {HUB_TASKS.map(t => (
              <button
                key={t.id}
                className={`hub-tag ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(tab === t.id ? 'all' : t.id)}
              >
                <Icon name={t.ic} size={11}/> {t.nm}
              </button>
            ))}
          </div>

          <div className="hub-landing-cols">
            <div className="hub-landing-col">
              <div className="hub-landing-col-label">
                Installed{installedList.length > 0 && <span className="hub-landing-col-n"> · {installedList.length}</span>}
              </div>
              {installedList.length === 0 ? (
                <div className="hub-landing-empty">Nothing yet. Pick something from the Suggested list →</div>
              ) : (
                <ul className="hub-landing-list">
                  {installedList.map(m => (
                    <li key={m.id} className="hub-landing-row" onClick={() => onOpenModel && onOpenModel(m.id)}>
                      <div className="hub-landing-row-l">
                        <div className="hub-landing-row-nm">{m.nm}</div>
                        <div className="hub-landing-row-meta">{m.owner}{m.task && <> · <span className="mono">{m.task}</span></>}</div>
                      </div>
                      <div className="hub-landing-row-r mono">{m.size}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="hub-landing-col">
              <div className="hub-landing-col-label">Suggested for you</div>
              {suggestedLoading && suggestedList.length === 0 ? (
                <div className="hub-landing-empty">Loading suggestions from HuggingFace…</div>
              ) : suggestedList.length === 0 ? (
                <div className="hub-landing-empty">No suggestions right now. Browse the Hub above.</div>
              ) : (
                <ul className="hub-landing-list">
                  {suggestedList.map(m => {
                    const owner = (m.id || '').split('/')[0];
                    const nm = m.nm || (m.id || '').split('/').pop();
                    const dl = downloads[m.id];
                    const error = dl?.status === 'error';
                    const gated = error && _looksGated(dl?.error);
                    const hasPct = dl && typeof dl.pct === 'number' && dl.total > 0;
                    const pct = hasPct ? Math.max(0, Math.min(100, dl.pct)) : null;
                    const onRowClick = () => {
                      if (dl && !error) return;          // don't double-start a running download
                      if (error) { cancelDownload(m.id); startDownload(m); return; }
                      startDownload(m);
                    };
                    return (
                      <li
                        key={m.id}
                        className={`hub-landing-row ${dl ? 'is-downloading' : ''}`}
                        onClick={onRowClick}
                      >
                        <div className="hub-landing-row-l">
                          <div className="hub-landing-row-nm">{nm}</div>
                          <div className="hub-landing-row-meta">{owner}{m.task && <> · <span className="mono">{m.task}</span></>}</div>
                          {dl && !error && (
                            <div className={`dl-bar ${hasPct ? '' : 'indeterminate'} hub-landing-row-bar`}>
                              <div className="dl-bar-fill" style={hasPct ? { width: `${pct}%` } : undefined}/>
                            </div>
                          )}
                          {error && !gated && (
                            <div className="hub-landing-row-err">{dl?.error?.slice(0, 80) || 'failed'}</div>
                          )}
                          {gated && (
                            <div className="hub-landing-row-err">Gated repo. Set your HF token in Settings, then retry.</div>
                          )}
                        </div>
                        <div className="hub-landing-row-r mono">
                          {dl && !error ? (
                            <>
                              <span>{hasPct ? `${pct.toFixed(0)}%` : 'starting…'}</span>
                              <button
                                className="hub-landing-row-x"
                                onClick={(e) => { e.stopPropagation(); cancelDownload(m.id); }}
                                title="Cancel download"
                              >
                                <Icon name="x" size={11}/>
                              </button>
                            </>
                          ) : error ? (
                            <button
                              className="hub-landing-row-x"
                              onClick={(e) => { e.stopPropagation(); cancelDownload(m.id); }}
                              title="Dismiss"
                            >
                              <Icon name="x" size={11}/>
                            </button>
                          ) : (
                            <><Icon name="download" size={11}/> {m.size || '—'}</>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hub-head">
          <div className="hub-title-row">
            <div className="hub-title">Model Hub</div>
            <div className="hub-sub">Browse HuggingFace · download and run locally</div>
            <div style={{flex:1}}/>
            <div className="hub-stats">
              <span><span className="n">{installedCount}</span> installed</span>
              {activeDownloads > 0 && <span><span className="n">{activeDownloads}</span> downloading</span>}
            </div>
          </div>
          <div className="hub-search-row">
            <div className="hub-search">
              <Icon name="search" size={13} style={{color:'var(--fg-3)'}}/>
              <input
                placeholder={showInstalled ? 'Filter installed…' : 'Search HuggingFace Hub…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button className="hub-search-clear" onClick={() => setQuery('')}><Icon name="x" size={11}/></button>}
            </div>
          </div>
          {/* Hide modality pills once the user is actively searching by name.
              They reappear when the search box is cleared so the user can
              switch back to "browse by category". Also hidden in
              Installed-only mode where there's no Hub-side filter to show. */}
          {!showInstalled && !query.trim() && (
            <div className="hub-tag-list" style={{justifyContent: 'flex-start'}}>
              {HUB_TASKS.map(t => (
                <button
                  key={t.id}
                  className={`hub-tag ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(tab === t.id ? 'all' : t.id)}
                >
                  <Icon name={t.ic} size={11}/> {t.nm}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="hub-body">
        {/* Persistent downloads tracker. On the landing view, the Suggested
            column already renders an inline progress bar per row, so the
            bottom strip would duplicate every visible download. We only
            surface it on landing for *orphan* downloads — ones the user
            kicked off elsewhere (search results, a different category)
            that aren't in the current Suggested sample, otherwise they'd
            be invisible until the user navigates back. In search view we
            always show it as a persistent tracker that survives scroll. */}
        {(() => {
          const inlineIds = hasActiveFilter ? new Set() : new Set((suggestedList || []).map(s => s.id));
          const stripEntries = Object.entries(downloads).filter(([id]) => !inlineIds.has(id));
          if (stripEntries.length === 0) return null;
          return (
            <div className="hub-section">
              <div className="sec-title-row"><span>Downloading</span><span className="line"/></div>
              {stripEntries.map(([id, st]) => {
                const m = models.find(x => x.id === id) || { nm: id.split('/').pop(), path: id };
                const error = st.status === 'error';
                const gated = error && _looksGated(st.error);
                const hasPct = typeof st.pct === 'number' && st.total > 0;
                const pct = hasPct ? Math.max(0, Math.min(100, st.pct)) : null;
                return (
                  <div key={id} className="dl-card">
                    <div className="dl-head">
                      <span className="nm">{m.nm}</span>
                      <span className="path">{m.path || id}</span>
                      <span className="rate">
                        {error ? 'failed' : (hasPct ? `${fmtBytes(st.done)} / ${fmtBytes(st.total)}` : 'starting…')}
                      </span>
                      <button className="tb-btn" onClick={() => cancelDownload(id)} style={{marginLeft: 8}}><Icon name="x" size={11}/> Dismiss</button>
                    </div>
                    {!error && (
                      <div className={`dl-bar ${hasPct ? '' : 'indeterminate'}`}>
                        <div className="dl-bar-fill" style={hasPct ? { width: `${pct}%` } : undefined}/>
                      </div>
                    )}
                    {!error && hasPct && (
                      <div className="dl-foot"><span className="pct">{pct.toFixed(1)}%</span><span>huggingface_hub</span></div>
                    )}
                    {error && !gated && <div className="dl-foot" style={{color:'var(--bad)'}}>{st.error}</div>}
                    {gated && (
                      <GatedTokenPrompt
                        modelId={id}
                        onOpenSettings={onOpenSettings}
                        onRetry={() => { cancelDownload(id); startDownload(m); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {hasActiveFilter && loading && models.length === 0 && <div className="hub-empty">Searching HuggingFace…</div>}
        {hasActiveFilter && err && models.length === 0 && <div className="hub-empty bad">Error: {err}</div>}
        {hasActiveFilter && !loading && !err && models.length === 0 && (
          <div className="hub-empty">
            {showInstalled
              ? 'No models installed yet. Browse a category and click Download.'
              : (hiddenCount > 0
                  ? `No supported models in these results (${hiddenCount} filtered out: task not supported yet).`
                  : (() => {
                      const q = debouncedQuery.trim();
                      const sel = HUB_TASKS.find(t => t.id === tab);
                      const tabNm = sel && sel.id !== 'all' ? sel.nm : null;
                      if (q && tabNm) return `No ${tabNm} models match "${q}". Clear the search or switch to the All tab.`;
                      if (q)          return `No models match "${q}".`;
                      if (tabNm)      return `No ${tabNm} models found.`;
                      return 'No results.';
                    })())}
          </div>
        )}
        {err && models.length > 0 && (
          <div className="hub-empty bad" style={{padding: '8px 12px', margin: '0 0 10px'}}>
            Couldn't refresh: {err}. Showing previous results.
          </div>
        )}
        {!loading && models.length > 0 && (
          <div className="hub-grid">
            {models.map(m => (
              <ModelCard
                key={m.id}
                m={m}
                onInstall={() => startDownload(m)}
                onUninstall={() => uninstall(m.id)}
                onOpen={() => onOpenModel && onOpenModel(m.id)}
                downloading={!!downloads[m.id]}
                dlPct={downloads[m.id]?.pct}
                dlDone={downloads[m.id]?.done}
                dlTotal={downloads[m.id]?.total}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function randRate() { return (Math.random() * 12 + 6).toFixed(1); }

function fmtBytes(b) {
  if (!b || b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function ModelCard({ m, onInstall, onUninstall, onOpen, downloading, dlPct, dlDone, dlTotal }) {
  const sizeDisplay = m.size && m.size !== '-' ? m.size : null;
  const sizeLabel = sizeDisplay
    ? sizeDisplay
    : (m.sizeFetched ? <span className="mc-size-dim">size unknown</span> : <span className="mc-size-dim">fetching…</span>);
  const handleMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div className={`model-card ${m.installed ? 'installed' : ''}`} onMouseMove={handleMove}>
      <div className="mc-body">
        <div className="mc-name">
          <span className="nm">{m.nm}</span>
          {m.installed && <span className="mc-chip ok"><Icon name="check" size={10}/> Installed</span>}
        </div>
        <div className="mc-path">{m.path || m.id}</div>
        {m.desc && <div className="mc-desc">{m.desc}</div>}
        <div className="mc-meta">
          {m.task && <span className="mc-tag task">{m.task}</span>}
          {m.params && <span className="mc-tag"><span className="k">params</span>{m.params}</span>}
          {m.dl && <span className="mc-tag"><span className="k">dl</span>{m.dl}/mo</span>}
          {m.license && <span className="mc-tag"><span className="k">lic</span>{m.license}</span>}
          {m.hw === 'ok' && <span className="mc-tag ok">● fits</span>}
          {m.hw === 'warn' && <span className="mc-tag warn">⚠ large</span>}
        </div>
      </div>
      <div className="mc-footer">
        <div className="mc-size">
          <Icon name="download" size={12}/>
          <span className="mc-size-val">{sizeLabel}</span>
        </div>
        <div className="mc-actions">
          {m.installed ? (
            <>
              <button className="mc-btn primary" onClick={onOpen}><Icon name="arrow_right" size={12}/> Open</button>
              <button className="mc-btn ghost" onClick={onUninstall}><Icon name="x" size={11}/> Remove</button>
            </>
          ) : downloading ? (
            (() => {
              const hasPct = typeof dlPct === 'number' && dlTotal > 0;
              const pct = hasPct ? Math.max(0, Math.min(100, dlPct)) : null;
              return (
                <div
                  className={`mc-btn downloading ${hasPct ? '' : 'indeterminate'}`}
                  style={hasPct ? { '--pct': `${pct}%` } : undefined}
                  role="progressbar"
                  aria-valuenow={hasPct ? pct : undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="mc-dl-fill"/>
                  <span className="mc-dl-text">
                    <Icon name="download" size={12}/>
                    {hasPct
                      ? <>{pct.toFixed(0)}% · {fmtBytes(dlDone)} / {fmtBytes(dlTotal)}</>
                      : <>Downloading…</>}
                  </span>
                </div>
              );
            })()
          ) : (
            <>
              <button className="mc-btn primary" onClick={onInstall}>
                <Icon name="download" size={12}/> Download{sizeDisplay ? ` · ${sizeDisplay}` : ''}
              </button>
              <button className="mc-btn ghost" onClick={() => window.localml?.app.openExternal(`https://huggingface.co/${m.id || m.path}`)}>View</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Heuristic: does an HF download error look like a gated / unauthorized repo?
function _looksGated(msg) {
  const s = String(msg || '').toLowerCase();
  return s.includes('401') || s.includes('403')
      || s.includes('gated') || s.includes('unauthorized')
      || s.includes('access to this model')
      || s.includes('login') || s.includes('token')
      || s.includes('huggingface-cli login');
}

function GatedTokenPrompt({ modelId, onOpenSettings, onRetry }) {
  return (
    <div className="gated-prompt">
      <div className="gated-prompt-msg">
        <Icon name="alert" size={12}/>
        <span>This model is gated. Set your HuggingFace token in Settings, then retry.</span>
      </div>
      <div className="gated-prompt-actions">
        <button className="mc-btn primary" onClick={() => onOpenSettings && onOpenSettings('hf')}>
          <Icon name="settings" size={11}/> Open Settings
        </button>
        <button className="tb-btn" onClick={() => onRetry && onRetry()} title="Re-attempt the download once your token is set">
          <Icon name="arrow_right" size={11}/> Retry
        </button>
        <span style={{flex: 1}}/>
        <a
          className="hub-link"
          onClick={() => window.localml?.app.openExternal(`https://huggingface.co/${modelId}`)}
        >
          Request access on Hugging Face
        </a>
      </div>
    </div>
  );
}

window.ModelHub = ModelHub;
