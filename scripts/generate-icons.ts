/**
 * Generate ECHO PWA icons (SVG → PNG via sharp) — build-time script.
 * Run: bun scripts/generate-icons.ts
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const svg = (size: number, maskable: boolean) => {
  const pad = maskable ? size * 0.18 : 0;
  const s = size - pad * 2;
  const u = s / 32; // unit
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="30%" cy="25%" r="100%">
      <stop offset="0%" stop-color="#141a30"/>
      <stop offset="100%" stop-color="#090b14"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="url(#bg)"/>
  <g transform="translate(${pad},${pad})" fill="none" stroke-linecap="round">
    <circle cx="${13.5 * u}" cy="${18.5 * u}" r="${2.6 * u}" fill="#8B7CFF" stroke="none"/>
    <path d="M ${13.5 * u} ${10.7 * u} a ${7.8 * u} ${7.8 * u} 0 0 1 0 ${15.6 * u}" stroke="#8B7CFF" stroke-width="${1.8 * u}" opacity="0.9"/>
    <path d="M ${13.5 * u} ${5.4 * u} a ${13.1 * u} ${13.1 * u} 0 0 1 0 ${26.2 * u}" stroke="#8B7CFF" stroke-width="${1.8 * u}" opacity="0.45"/>
    <path d="M ${13.5 * u} ${1.6 * u} A ${16.9 * u} ${16.9 * u} 0 0 1 ${30.4 * u} ${18.5 * u}" stroke="#60D7E8" stroke-width="${1.8 * u}" opacity="0.5"/>
    <circle cx="${23.5 * u}" cy="${9 * u}" r="${1.5 * u}" fill="#E78BCB" stroke="none"/>
    <circle cx="${28 * u}" cy="${16 * u}" r="${1 * u}" fill="#60D7E8" stroke="none"/>
    <circle cx="${21 * u}" cy="${26 * u}" r="${1.1 * u}" fill="#F4F5FA" stroke="none" opacity="0.7"/>
  </g>
</svg>`;
};

async function main() {
  writeFileSync(`${OUT}/icon.svg`, svg(512, false));
  for (const [name, size, maskable] of [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["maskable-512.png", 512, true],
  ] as const) {
    await sharp(Buffer.from(svg(size, maskable))).png().toFile(`${OUT}/${name}`);
    console.log(`wrote ${OUT}/${name}`);
  }
  console.log("done");
}

main();
