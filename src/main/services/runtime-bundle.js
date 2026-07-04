// Hardware detection + portable-Python URL resolution.
//
// LocalML doesn't ship Python in the installer. On first launch we download
// a redistributable Python from astral-sh/python-build-standalone (publicly
// hosted on GitHub Releases, ~30 MB compressed) and use it to pip-install
// torch + the rest of `requirements.txt`. This module owns the per-platform
// URL + the GPU/CPU detection that drives the onboarding picker.

const os = require('os');
const { execSync } = require('child_process');

// Pinned Python build. Bump together if you want a newer interpreter.
// See https://github.com/astral-sh/python-build-standalone/releases
const PBS_DATE    = '20250409';
const PBS_VERSION = '3.12.10';

// Pinned uv version. uv is Astral's drop-in pip replacement — 10–100× faster
// thanks to parallel downloads and a Rust resolver. We use it instead of pip
// for the first-launch install since it cuts ~30–50% off the wall time on
// the torch + transformers + diffusers wheels.
// See https://github.com/astral-sh/uv/releases
const UV_VERSION = '0.11.8';

function detectOs() {
  if (process.platform === 'win32')  return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

// nvidia-smi is the cheapest "do you have a usable NVIDIA GPU?" probe — it
// only succeeds when the driver is installed. macOS has no NVIDIA path.
function hasNvidiaGpu() {
  if (process.platform === 'darwin') return false;
  try {
    execSync('nvidia-smi --query-gpu=name --format=csv,noheader', {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

// Apple Silicon (arm64 macOS) has Metal Performance Shaders built into the
// default torch wheel — no separate index, just `pip install torch`.
function hasAppleSiliconGpu() {
  return process.platform === 'darwin' && os.arch() === 'arm64';
}

function suggestAccelerator() {
  if (hasNvidiaGpu()) return 'gpu';
  if (hasAppleSiliconGpu()) return 'gpu';
  return 'cpu';
}

// python-build-standalone uses Rust target triples. Only the three triples
// our app supports are mapped here; anything else falls back to system
// Python detection.
function pbsTriple() {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'darwin') {
    return os.arch() === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  // Linux — assume glibc x86_64. Users on musl/aarch64 distros fall back to
  // system python in python-setup.js.
  return 'x86_64-unknown-linux-gnu';
}

function pythonStandaloneUrl() {
  const triple = pbsTriple();
  const file = `cpython-${PBS_VERSION}+${PBS_DATE}-${triple}-install_only.tar.gz`;
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_DATE}/${file}`;
}

// Path inside the extracted tarball where the actual python executable lives.
function bundledPythonRelPath() {
  return process.platform === 'win32' ? 'python/python.exe' : 'python/bin/python3';
}

// uv ships per-platform binaries from astral-sh/uv on GitHub Releases. The
// triple naming matches python-build-standalone's so the same triple helper
// would work — keeping a separate function in case Astral diverges naming
// between the two projects.
function uvTriple() {
  if (process.platform === 'win32') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'darwin') {
    return os.arch() === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }
  return 'x86_64-unknown-linux-gnu';
}

function uvUrl() {
  const triple = uvTriple();
  // Windows ships uv as a .zip (uv.exe at the root); POSIX ships .tar.gz with
  // a single uv-<triple>/ directory inside.
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  return `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${triple}.${ext}`;
}

// Path inside `<runtimeDir>/uv/` where we land the binary after extraction.
// On POSIX we strip the leading `uv-<triple>/` directory during extract so
// the layout is uniform.
function bundledUvRelPath() {
  return process.platform === 'win32' ? 'uv/uv.exe' : 'uv/uv';
}

// pip torch index URL for the chosen accelerator. macOS uses the default
// PyPI index either way (CPU on Intel; CPU + MPS on Apple Silicon), so the
// "gpu" pick is a no-op there.
function torchIndexUrl(accel) {
  if (process.platform === 'darwin') return null;
  if (accel === 'gpu') return 'https://download.pytorch.org/whl/cu124';
  return 'https://download.pytorch.org/whl/cpu';
}

module.exports = {
  PBS_VERSION,
  UV_VERSION,
  detectOs,
  hasNvidiaGpu,
  hasAppleSiliconGpu,
  suggestAccelerator,
  pythonStandaloneUrl,
  bundledPythonRelPath,
  uvUrl,
  bundledUvRelPath,
  torchIndexUrl,
};
