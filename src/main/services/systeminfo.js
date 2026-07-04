const si = require('systeminformation');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);

function pickGpu(controllers) {
  if (!controllers.length) return {};
  const score = (c) => {
    const v = (c.vendor || '').toLowerCase();
    const m = (c.model || '').toLowerCase();
    const integrated = v.includes('intel') || m.includes('uhd') || m.includes('iris') || m.includes('hd graphics');
    const discrete = v.includes('nvidia') || v.includes('amd') || v.includes('advanced micro') ||
                     m.includes('radeon') || m.includes('rtx') || m.includes('gtx') || m.includes('quadro');
    const vram = c.memoryTotal || c.vram || 0;
    return (discrete ? 1e9 : 0) + vram - (integrated ? 1e6 : 0);
  };
  return controllers.slice().sort((a, b) => score(b) - score(a))[0] || controllers[0];
}

// ─── platform-specific real-time GPU probes ──────────────────────────────────
//
// systeminformation's si.graphics() works but lazily refreshes some fields on
// Windows and returns 0s on Apple Silicon. These probes go directly to the
// authoritative tools each cycle so the values are actually live.

// nvidia-smi ships with the NVIDIA driver. Available on Win + Linux whenever
// CUDA hardware is present. ~50ms per call.
async function probeNvidia() {
  if (process.platform === 'darwin') return null;
  try {
    const { stdout } = await execFileP('nvidia-smi', [
      '--query-gpu=name,memory.used,memory.total,utilization.gpu,utilization.memory,temperature.gpu',
      '--format=csv,noheader,nounits',
    ], { timeout: 1500 });
    const line = stdout.trim().split('\n')[0];   // primary GPU
    if (!line) return null;
    const parts = line.split(',').map(s => s.trim());
    const [name, memUsed, memTotal, util, memBwUtil, temp] = parts;
    return {
      model:       name,
      memUsed:     parseInt(memUsed, 10)  * 1024 * 1024,   // MB → bytes
      memTotal:    parseInt(memTotal, 10) * 1024 * 1024,
      utilization: parseInt(util, 10),                     // percent
      memBwUtil:   parseInt(memBwUtil, 10),                // memory bw %, can be useful
      temperature: parseInt(temp, 10),                     // celsius
    };
  } catch {
    return null;
  }
}

// AMD ROCm — only present on Linux machines that have explicitly installed
// ROCm. Mostly absent in practice but cheap to try.
async function probeAmdRocm() {
  if (process.platform !== 'linux') return null;
  try {
    const { stdout } = await execFileP('rocm-smi', [
      '--showmemuse', '--showuse', '--csv',
    ], { timeout: 1500 });
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) return null;
    // rocm-smi CSV varies by version — best-effort parse of the data row.
    const cols = lines[1].split(',').map(s => s.trim());
    // GPU% and VRAM% are typically in the first few columns; bail if we
    // can't see anything number-shaped.
    const utilization = Number(cols.find(c => /^\d+$/.test(c))) || 0;
    return { utilization };  // ROCm doesn't expose absolute bytes via this command consistently
  } catch {
    return null;
  }
}

// Apple Silicon: there's no distinct VRAM (unified memory architecture).
// vm_stat gives a real-time breakdown of memory pages — "active" + "wired"
// + "compressed" approximates the live in-use bytes. More accurate than
// `mem.total - mem.available` because it excludes inactive (cached) pages.
async function probeMacUnified() {
  if (process.platform !== 'darwin') return null;
  try {
    const [vmOut, sysOut] = await Promise.all([
      execFileP('vm_stat', [], { timeout: 1500 }),
      execFileP('sysctl', ['-n', 'hw.pagesize', 'hw.memsize'], { timeout: 1500 }),
    ]);
    // vm_stat output looks like "Pages active:                  3146298." — parse counts.
    const counts = {};
    for (const line of vmOut.stdout.split('\n')) {
      const m = line.match(/^(.+?):\s+(\d+)\.?$/);
      if (m) counts[m[1].trim().toLowerCase()] = parseInt(m[2], 10);
    }
    const sysLines = sysOut.stdout.trim().split('\n');
    const pageSize = parseInt(sysLines[0], 10) || 16384;   // M-series default
    const memTotal = parseInt(sysLines[1], 10) || 0;
    const active     = counts['pages active']           || 0;
    const wired      = counts['pages wired down']       || 0;
    const compressed = counts['pages occupied by compressor'] || 0;
    const memUsed = (active + wired + compressed) * pageSize;
    return { memUsed, memTotal };
  } catch {
    return null;
  }
}

async function sampleHw() {
  try {
    const [cpuInfo, mem, gfx, fsArr, osInfo, load, nv, mac, amd] = await Promise.all([
      si.cpu(), si.mem(), si.graphics(), si.fsSize(), si.osInfo(), si.currentLoad(),
      probeNvidia(),
      probeMacUnified(),
      probeAmdRocm(),
    ]);
    const gpu = pickGpu(gfx.controllers || []);
    const bestDisk = (fsArr || []).slice().sort((a, b) => b.size - a.size)[0] || {};

    const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';

    // Build the gpu object from the most authoritative source available:
    // nvidia-smi > vm_stat (Mac unified) > systeminformation > defaults.
    let gpuOut;
    if (nv) {
      gpuOut = {
        model:       nv.model || gpu.model || 'NVIDIA GPU',
        vendor:      'NVIDIA',
        vram:        nv.memTotal,
        memUsed:     nv.memUsed,
        memTotal:    nv.memTotal,
        utilization: nv.utilization,
        temperature: nv.temperature,
        driver:      gpu.driverVersion || '',
        source:      'nvidia-smi',
        unified:     false,
      };
    } else if (isAppleSilicon && mac) {
      gpuOut = {
        model:       gpu.model || 'Apple Silicon GPU',
        vendor:      gpu.vendor || 'Apple',
        vram:        mac.memTotal,
        memUsed:     mac.memUsed,
        memTotal:    mac.memTotal,
        utilization: null,                  // not easily queryable without sudo
        driver:      gpu.driverVersion || '',
        source:      'vm_stat',
        unified:     true,
      };
    } else {
      // Fallback: whatever systeminformation gave us.
      const memTotalSi = (gpu.memoryTotal || gpu.vram || 0) * 1024 * 1024;
      const memUsedSi  = (gpu.memoryUsed || 0) * 1024 * 1024;
      gpuOut = {
        model:       gpu.model || 'Integrated GPU',
        vendor:      gpu.vendor || '',
        vram:        memTotalSi,
        memUsed:     memUsedSi,
        memTotal:    memTotalSi,
        utilization: amd?.utilization ?? null,
        driver:      gpu.driverVersion || '',
        source:      amd ? 'rocm-smi' : 'systeminformation',
        unified:     false,
      };
    }

    return {
      cpu: {
        brand: cpuInfo.brand,
        cores: cpuInfo.physicalCores || cpuInfo.cores,
        threads: cpuInfo.cores,
        speed: cpuInfo.speed,
        load: Math.round(load.currentLoad || 0),
      },
      mem: {
        total: mem.total,
        used: mem.total - mem.available,
        free: mem.available,
        pct: Math.round(((mem.total - mem.available) / mem.total) * 100),
      },
      gpu: gpuOut,
      disk: {
        total: bestDisk.size || 0,
        used: bestDisk.used || 0,
        free: (bestDisk.size || 0) - (bestDisk.used || 0),
        mount: bestDisk.mount || '/',
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        build: osInfo.build,
        arch: osInfo.arch,
      },
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

module.exports = { sampleHw, pickGpu };
