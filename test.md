# LocalML - Model Family Test Checklist

Every family lives under `python/models/<family>/`. Pick one small variant per family from the HuggingFace Hub, install it through LocalML, and run a sample input. Tick the box once a small variant works end-to-end (download → load → inference → output renders).

Counts shown below match `python/models/` at the time of writing.

---

## Text generation - LLMs (33)

- [ ] **bamba** - IBM/Mistral/Princeton hybrid Mamba transformer
- [ ] **bitnet** - 1.58-bit quantized LM, Microsoft Research
- [ ] **bloom** - BigScience multilingual LM
- [ ] **codegen** - Salesforce code-generation transformer
- [ ] **cohere** - Command R / Command R+ family
- [ ] **dbrx** - Databricks MoE language model
- [ ] **deepseek** - V1, V2, V3 (incl. R1-distill)
- [ ] **exaone** - LG AI Research bilingual LM
- [ ] **falcon** - Falcon, Falcon-Mamba, Falcon-H1 hybrid
- [ ] **gemma** - Gemma, Gemma2, Gemma3 (text), Gemma 3n  *(gated)*
- [ ] **glm** - THUDM GLM, GLM-4, GLM-MoE-DSA
- [ ] **gpt2** - GPT-2, GPT-Neo, GPT-NeoX, GPT-J, GPT-BigCode
- [ ] **gpt_oss** - OpenAI 20B open-weights model
- [ ] **granite** - IBM Granite + Granite-MoE
- [ ] **jamba** - AI21 Labs SSM-transformer hybrid
- [ ] **llama** - Meta Llama 3.x / 4  *(gated)*
- [ ] **mamba** - Mamba state-space LMs (v1 + v2)
- [ ] **minimax** - MiniMax + MiniMax-M2 + MiMo
- [ ] **mistral** - Mistral, Mixtral, Mistral 3, Ministral 3
- [ ] **mpt** - MosaicML open-source LM
- [ ] **nemotron** - NVIDIA Nemotron + Nemotron-H
- [ ] **olmo** - OLMo, OLMo2, OLMo3, OLMoE
- [ ] **opt** - Meta Open Pre-trained Transformer
- [ ] **persimmon** - Adept pre-Fuyu LM
- [ ] **phi** - Phi, Phi3, Phi4, Phi-MoE
- [ ] **qwen** - Qwen2, Qwen2-MoE, Qwen3, Qwen3-MoE
- [ ] **rwkv** - Linear-attention RNN-style LM
- [ ] **smollm** - HuggingFace SmolLM3 3B
- [ ] **stablelm** - Stability AI open LM
- [ ] **starcoder2** - BigCode code-specialized LM
- [ ] **xglm** - Multilingual GPT, Meta
- [ ] **xlnet** - Permuted-context autoregressive LM
- [ ] **zamba** - Zyphra hybrid Mamba transformer (v1 + v2)

## Vision-language models - image-text-to-text (26)

- [ ] **aria** - rhymes-ai 25B MoE multimodal
- [ ] **chameleon** - Meta early-fusion mixed-modal
- [ ] **cohere2_vision** - Cohere2 vision-language
- [ ] **deepseek_vl** - DeepSeek-VL (custom adapter, trust_remote_code)
- [ ] **emu3** - BAAI unified gen + understanding (trust_remote_code)
- [ ] **fastvlm** - FastVLM (custom adapter)
- [ ] **florence2** - Microsoft Florence-2 (custom adapter)
- [ ] **fuyu** - Adept persimmon-based VLM
- [ ] **gemma3_vlm** - Gemma3 4b/12b/27b vision  *(gated)*
- [ ] **glm4v** - THUDM GLM4V (incl. MoE variant)
- [ ] **got_ocr2** - Stepfun general-purpose OCR
- [ ] **hunyuan_vl** - Tencent Hunyuan multimodal
- [ ] **idefics** - IDEFICS / IDEFICS2 / IDEFICS3
- [ ] **internvl** - OpenGVLab InternVL family
- [ ] **janus** - DeepSeek Janus-Pro (custom adapter, image gen + understanding)
- [ ] **kimi_vl** - Moonshot Kimi-VL / Kimi-K25
- [ ] **kosmos** - Microsoft Kosmos-2 / Kosmos-2.5
- [ ] **lfm2_vl** - Liquid AI 450M VLM
- [ ] **llava** - LLaVA family (custom adapter)
- [ ] **minicpm_v** - OpenBMB compact VLM
- [ ] **mllama** - Llama-3.2-Vision  *(gated)*
- [ ] **moondream** - Moondream (custom adapter, vikhyatk/moondream owner only for trust_remote_code)
- [ ] **ovis** - AIDC-AI Ovis 1.x / 2.x (trust_remote_code)
- [ ] **paligemma** - Google PaliGemma 1 / 2  *(gated)*
- [ ] **qwen_vl** - Qwen2-VL / Qwen2.5-VL / Qwen3-VL (custom adapter)
- [ ] **smolvlm** - HuggingFace SmolVLM 1 / 2

## Image captioning / image-to-text (7)

- [ ] **blip** - BLIP + BLIP-2 (caption / VQA / matching)
- [ ] **donut** - Document Understanding Transformer (no OCR step)
- [ ] **git** - Microsoft Generative Image-to-text
- [ ] **mgp_str** - Multi-Granularity Scene Text Recognition
- [ ] **pix2struct** - Google screenshot-to-structured-text
- [ ] **trocr** - Transformer OCR (printed + handwritten)
- [ ] **vision_encoder_decoder** - Generic ViT-GPT2 captioner

## Image classification (15)

- [ ] **bit** - BiT Big Transfer (ResNet-V2)
- [ ] **convnext** - ConvNeXt v1 + v2
- [ ] **cvt** - Convolutional vision Transformer
- [ ] **efficientnet** - EfficientNet
- [ ] **focalnet** - Focal modulation networks
- [ ] **levit** - LeViT hybrid CNN-transformer
- [ ] **mobilenet** - MobileNet v1 / v2 / MobileViT v1 / v2
- [ ] **poolformer** - MetaFormer with pooling
- [ ] **pvt** - Pyramid Vision Transformer v1 + v2
- [ ] **regnet** - Facebook RegNet
- [ ] **resnet** - Classic deep residual
- [ ] **swiftformer** - Efficient additive attention
- [ ] **swin** - Swin Transformer v1 + v2
- [ ] **timm** - Generic timm-backed classifier (transformers ≥ 4.40)
- [ ] **vit** - ViT / DeiT / BEiT

## Object detection (7)

- [ ] **conditional_detr** - DETR with conditional cross-attention
- [ ] **d_fine** - Real-time DETR with fine-grained box refinement
- [ ] **deformable_detr** - Sparse spatial sampling DETR
- [ ] **detr** - Facebook End-to-End Detection
- [ ] **rt_detr** - Real-time DETR v1 + v2
- [ ] **table_transformer** - DETR fine-tuned for table detection / structure
- [ ] **yolos** - Transformer-native YOLO (not Ultralytics)

## Zero-shot object detection (4)

- [ ] **grounding_dino** - Open-vocabulary DETR with text grounding
- [ ] **mm_grounding_dino** - Multimodal Grounding-DINO
- [ ] **omdet_turbo** - Real-time open-vocabulary detector
- [ ] **owlvit** - Google OWL-ViT v1 + v2

## Image segmentation (8)

- [ ] **data2vec_vision** - Self-supervised pretraining (segmentation head)
- [ ] **eomt** - Encoder-only Mask Transformer
- [ ] **eomt_dinov3** - EoMT with DINOv3 backbone
- [ ] **mask2former** - Universal segmentation transformer
- [ ] **maskformer** - Per-pixel mask classification
- [ ] **oneformer** - Universal seg with semantic / instance / panoptic mode
- [ ] **segformer** - Hierarchical encoder + MLP decoder
- [ ] **upernet** - Unified perceptual parsing for scenes

## Mask generation - SAM-style (5)

- [ ] **edgetam** - Lightweight SAM variant (segmentation + tracking)
- [ ] **sam** - SAM v1, Meta Segment Anything
- [ ] **sam2** - SAM 2 / 2.1, Hiera-backbone (image + video)
- [ ] **sam3** - Meta third-generation SAM
- [ ] **sam_hq** - Higher-quality SAM with sharper boundaries

## Depth estimation (4)

- [ ] **depth_anything** - Depth Anything v1 + v2
- [ ] **depth_pro** - Apple monocular depth
- [ ] **dpt** - Dense Prediction Transformer
- [ ] **zoedepth** - Metric depth estimation

## Zero-shot image classification (2)

- [ ] **clip** - OpenAI contrastive image-text + variants
- [ ] **siglip** - Google sigmoid-loss CLIP v1 + v2

## Text-to-image - diffusion (9)

- [ ] **flux** - Black Forest Labs rectified flow transformer
- [ ] **kandinsky** - Kandinsky v2.2 + v3
- [ ] **kolors** - Kuaishou Kolors
- [ ] **pixart** - PixArt-α + PixArt-Σ
- [ ] **playground** - Playground v2 + v2.5 (SDXL-arch)
- [ ] **sana** - NVIDIA linear-attention DiT
- [ ] **sdxl** - SDXL base, SDXL-Turbo, SD-Turbo
- [ ] **sdxl_turbo** - CFG-distilled fast variants (1-4 steps)
- [ ] **stable_diffusion** - SD 1.5 / 2.x / 3 / 3.5

## Image-to-image / inpainting (3)

- [ ] **instructpix2pix** - Instruction-following image editor
- [ ] **sd_inpainting** - SD 1.5 / 2.0 / SDXL inpainting
- [ ] **sdxl_refiner** - Two-stage SDXL refinement

## Automatic speech recognition - ASR (9)

- [ ] **granite_speech** - IBM Granite Speech (STT + translation)
- [ ] **kyutai_stt** - Kyutai Labs real-time STT
- [ ] **moonshine** - Useful Sensors real-time English ASR
- [ ] **parakeet** - NVIDIA fast English ASR
- [ ] **pop2piano** - Audio-to-MIDI (pop song → piano)
- [ ] **seamless_m4t** - Meta Seamless-M4T v1 + v2
- [ ] **voxtral** - Mistral audio LM (ASR + translation + audio chat)
- [ ] **wav2vec2** - Wav2Vec2 + Conformer / BERT cousins
- [ ] **whisper** - OpenAI Whisper

## Text-to-speech - TTS (7)

- [ ] **bark** - Suno transformer TTS
- [ ] **csm** - Sesame Conversational Speech Model
- [ ] **dia** - nari-labs Dia-1.6B
- [ ] **fastspeech2** - FastSpeech 2 Conformer
- [ ] **musicgen** - MusicGen + MusicGen Melody
- [ ] **speecht5** - SpeechT5 with x-vector voice picker
- [ ] **vits** - VITS / Facebook MMS-TTS

## Document QA (1)

- [ ] **layoutlmv3** - Document understanding (text + layout)

## Translation (2)

- [ ] **m2m_100** - Many-to-many multilingual + NLLB-MoE + FSMT
- [ ] **marian** - Helsinki-NLP/opus-mt (~1000 language pairs)

## Summarization (1)

- [ ] **prophetnet** - Sequence-to-sequence summarization

---

## Test protocol per family

For each box, verify the full path:

1. **Search** the family name (or a known small checkpoint) in the Hub.
2. **Filter** matches LocalML's pill (e.g. `image-segmentation` for segformer).
3. **Download** completes and titlebar count increments live.
4. **Open** model - task UI matches the family (chat for LLMs/VLMs, image picker for vision, audio recorder for ASR, etc.).
5. **Run** a sample input - output renders correctly, no Python traceback.
6. **Uninstall** removes from disk and titlebar count decrements live.

If any step fails: note the family, the checkpoint id, and the error. Common failure modes to watch for:
- Gated repo without a saved HF token → expect the GatedTokenPrompt
- Missing system codec for audio (fix: `pip install soundfile` already in requirements)
- `trust_remote_code` families that get blocked → check `_TRUSTED_*_OWNERS` allowlist
- Diffusion families silently falling back to `DiffusersAdapter` instead of family-specific
- Custom adapters (`deepseek_vl`, `fastvlm`, `florence2`, `janus`, `llava`, `moondream`, `qwen_vl`) - verify the adapter's own preprocessing/postprocessing path, not just the generic pipeline

## Total: 143 families
