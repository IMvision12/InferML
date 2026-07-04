# TODO

What's worth adding to LocalML, ordered by effort vs. impact.

---

### Storage management + per-accelerator runtime (2026-05-05)

- [x] Settings → Storage now has Clean buttons for the HF cache and the Python runtime, each with a confirm dialog and shown size. New IPC handlers `storage:clearHfCache` and `storage:clearPyRuntime` (both gated to userData paths only, defense-in-depth).
- [x] Per-accelerator Python runtime layout: `userData/py-runtime/<cpu|gpu>/{python,uv}/`. CPU and GPU get independent venvs in sibling subdirs.
- [x] Fast switching: when both venvs exist, switching CPU↔GPU just updates `installed.json`'s `active` pointer. No torch reinstall, no wait. Only the first install of each accelerator triggers a full download.
- [x] Migration: pre-2026 single-tree installs (`py-runtime/python/...`) auto-migrate to `py-runtime/<accel>/python/...` on first boot via `_migrateToPerAccelerator()`. No reinstall needed.
- [x] Hardware panel button label adapts: "Switch to GPU (instant)" when the other accelerator is already installed, "Install GPU runtime" when it isn't.

---

### ASR
- [x] `voxtral` + `voxtral_realtime`. Mistral's audio LM (gated). `models/voxtral/`. Both registered as SpeechSeq2Seq (`VoxtralForConditionalGeneration` / `VoxtralRealtimeForConditionalGeneration`). Mistral uploads under `library_name: mistral-common`, so added to renderer's TRUST_REMOTE_CODE_LIBRARIES allowlist. Voxtral-Mini-3B (3B) surfaces; Voxtral-Small-24B (vllm-tagged) stays out.
- [x] `granite_speech`. IBM Granite Speech. `models/granite_speech/`. registered as SpeechSeq2Seq (`GraniteSpeechForConditionalGeneration`). `granite_speech_plus` is NOT yet a transformers model_type. revisit if IBM ships such a class.
- [x] `kyutai_speech_to_text`. Kyutai STT. `models/kyutai_stt/`. registered as SpeechSeq2Seq (same family as Whisper), delegates to the standard ASR pipeline.
- [ ] `moonshine_streaming`. Streaming Moonshine

### Detection / Segmentation extras
- [x] `omdet_turbo`. `models/omdet_turbo/`. zero-shot-object-detection. canonical model_type is `omdet-turbo` with a hyphen; both spellings registered.
- [x] `mm_grounding_dino`. `models/mm_grounding_dino/`. zero-shot-object-detection. canonical is `mm-grounding-dino`; both spellings registered.
- [x] `sam_hq`. `models/sam_hq/`. mask-generation. clean.
- [x] `edgetam`. `models/edgetam/`. mask-generation. registered both `edgetam` and `edgetam_video`. The official `facebook/EdgeTAM` repo uses `library_name: edgetam` and won't surface; transformers-canonical EdgeTAM repos load fine.
- [x] `eomt_dinov3`. `models/eomt_dinov3/`. image-segmentation. separate model_type from the existing `models/eomt/` (different config class).

### OCR / Image-to-text
- [x] `nougat`. Academic PDF OCR. Already covered: real repos (`facebook/nougat-*`) declare `model_type: vision-encoder-decoder` and route through `models/vision_encoder_decoder/`.
- [x] `mgp-str` / `mgp_str`. Scene text recognition. `models/mgp_str/`. canonical model_type uses a hyphen; both spellings registered.
- [x] `got_ocr2`. `models/got_ocr2/`. Both `got_ocr2` (canonical) and `got` (the spelling on `stepfun-ai/GOT-OCR2_0`) registered. trust_remote_code override pre-set in `model_overrides.json`.

### TTS / Audio
- [x] `dia`. nari-labs Dia. `models/dia/`. registered as text-to-speech. The original `nari-labs/Dia-1.6B` repo declares no library_name so won't surface until a community fork tags it canonically; transformers-tagged Dia repos load fine.
- [x] `pop2piano`. `models/pop2piano/`. routed through ASR (HF labels it ASR even though output is MIDI tokens). Dedicated MIDI workspace is a future TODO.
- [x] `csm`. Sesame CSM. `models/csm/`. text-to-speech. clean.

---

## Medium effort (new task workspaces, ~1 day each)

Each of these needs: a `python/tasks/<task>.py` handler, a `TASK_META` entry in `task-workspace.jsx`, and an entry in `supported_architectures.json`.

- [ ] **Audio classification** (`audio-classification`)
  - Models: `clap`, `audio_spectrogram_transformer`, `audioflamingo3`, `musicflamingo`
  - Output kind: `labels` (already exists)
  - UI: audio drop zone + optional candidate-label text for zero-shot CLAP

- [ ] **Pose estimation** (`pose-estimation`)
  - Models: `vitpose`, `vitpose_backbone`
  - Output kind: new `keypoints` (list of (x, y, confidence) per landmark)
  - UI: image drop + skeleton overlay renderer

- [ ] **Visual question answering** (`visual-question-answering`)
  - Models: `blip` (VQA fine-tunes), `vilt`
  - Output kind: `text`
  - UI: image + required question textarea
  - (Re-enables `Salesforce/blip-vqa-*` repos that are currently filtered out)

- [ ] **Image matting** (`image-matting`)
  - Models: `vitmatte`
  - Output kind: alpha-channel mask
  - UI: image + trimap input (or auto-generate from mask)

- [ ] **Keypoint matching** (`keypoint-matching`)
  - Models: `superpoint`, `superglue`, `lightglue`, `efficientloftr`
  - Output kind: new `keypoint-matches` (list of (point_a, point_b, score))
  - UI: two image slots + visualization of matched lines

---

## Bigger lifts (multi-day to multi-week)

- [ ] **Video task workspace**
  - New modality: video input (frame extraction + per-frame OR video-aware VLMs)
  - Models: `videomae`, `vjepa2`, `vivit`, `timesformer`, `video_llava`, `llava_next_video`, `video_llama_3`, `instructblipvideo`
  - UI: video drop zone, frame-sampling slider, prompt for video VLMs

- [ ] **Windows code signing**. SignPath Foundation OSS program (free for open source) eliminates SmartScreen warning on first launch
- [ ] **macOS code signing + notarization**. $99/yr Apple Dev ID, eliminates Gatekeeper warning

- [ ] **Batch processing workspace**
  - "Run this model on every file in a folder"
  - Outputs as CSV / JSON manifest + zipped result images
  - High value for non-demo use

- [ ] **Quantization-aware loading**
  - Add `autoawq` + `auto-gptq` to `python/requirements.txt`
  - AWQ / GPTQ repos already show in Hub but currently fail to load
  - Test inference end-to-end with a small AWQ model

- [ ] **Inference history / replay**
  - Persist per-session run history (input + params + output)
  - "Re-run" button on each run card
  - Export run as JSON for sharing / bug reports

- [ ] **Benchmarking**
  - "How fast does this run on my machine?" button per model
  - Captures tokens/sec (LLMs), FPS (vision), RTF (ASR)
  - Local leaderboard the user can reference when choosing variants

- [ ] **Settings: HF Token deep-link from gated download error**
  - Already works partially; verify the "Open Settings" button always lands on HF Token tab

- [ ] **Diffusion sampler / scheduler picker**
  - DPM++, DDIM, Euler etc. choice in the diffusion workspace
  - Per-model defaults via `model_overrides.json`

---

## Suggested first step

Append the following five `model_type` entries to `python/supported_architectures.json` to ship a meaningful expansion in ~10 minutes:

```
text-generation       += gpt_oss, smollm3
image-text-to-text    += internvl, kosmos2_5, fuyu
automatic-speech-recognition += voxtral
zero-shot-object-detection += omdet_turbo, mm_grounding_dino
mask-generation       += sam_hq
```

Then the next concrete piece worth building is the **audio classification workspace** (CLAP + AST). Most-requested missing modality, copies the existing image-classification handler shape, and unlocks audio tagging / sound-event detection workflows that no other quick win covers.

---

## Anti-pattern (do NOT add)

These have been considered and intentionally excluded:

- **Time-series models** (timesfm, autoformer, informer, patchtst). Separate modality, niche audience.
- **PaddleOCR family** (pp_lcnet, pp_ocrv5_*, paddleocr_vl). Needs PaddlePaddle runtime, not a transformers add-on.
- **Embeddings** (`feature-extraction` / `sentence-similarity`). Removed on purpose; raw vector output isn't a useful end-user artifact.
- **T5 / BART / Pegasus** families. Removed on purpose; can revisit if a similarity-comparator or RAG workspace lands.
- **LayoutLM v1 / v2**. Need external Tesseract / detectron2 we don't ship; LayoutLMv3 + Donut already cover the use case.
- **`vit_msn`, `nat`, `dinat`, `efficientformer`, `hiera`, `dinov2`** (image-classification). Removed because either model_type was dropped from current transformers OR no public classifier head fine-tune exists.
