#!/usr/bin/env node
// Convert website/assets/favicon.svg → build/icon.png (1024x1024) + build/icon.ico
// (multi-resolution). electron-builder picks these up automatically:
//   - Windows .exe + NSIS installer use icon.ico
//   - Linux AppImage + auto-derived macOS .icns use icon.png
// Run via `npm run icons` after editing the SVG.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

const ROOT = path.resolve(__dirname, '..');
const SRC_SVG = path.join(ROOT, 'website', 'assets', 'favicon.svg');
const OUT_DIR = path.join(ROOT, 'build');

async function main() {
  if (!fs.existsSync(SRC_SVG)) {
    console.error(`source SVG not found: ${SRC_SVG}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const svg = fs.readFileSync(SRC_SVG);

  // Master 1024x1024 PNG — electron-builder converts to .icns for macOS.
  const masterPng = path.join(OUT_DIR, 'icon.png');
  await sharp(svg, { density: 2400 }).resize(1024, 1024).png().toFile(masterPng);
  console.log(`wrote ${path.relative(ROOT, masterPng)}`);

  // Multi-res ICO for Windows installer + executable. The standard sizes
  // Windows actually uses across taskbar, alt-tab, file-explorer, jumplist.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    icoSizes.map(s =>
      sharp(svg, { density: 2400 })
        .resize(s, s)
        .png()
        .toBuffer()
    )
  );
  const icoBuffer = await pngToIco(buffers);
  const icoPath = path.join(OUT_DIR, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`wrote ${path.relative(ROOT, icoPath)} (sizes: ${icoSizes.join(',')})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
