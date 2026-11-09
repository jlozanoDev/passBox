/**
 * Renders assets/icon.svg into every asset the product needs:
 *   assets/icons/icon-<size>.png  (16 … 1024)
 *   assets/icons/icon.png         (512, the generic reference)
 *   assets/icons/icon.ico         (Windows, PNG-encoded entries)
 *   assets/icons/icon.icns        (macOS, PNG-encoded entries)
 *
 * Run with: node scripts/build-icons.mjs
 * The SVG is the single source of truth; the generated files are committed
 * so packaging never depends on this script being run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'assets', 'icon.svg'));
const outDir = join(root, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map();

for (const size of SIZES) {
  const resvg = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  pngs.set(size, png);
  writeFileSync(join(outDir, `icon-${size}.png`), png);
}

writeFileSync(join(outDir, 'icon.png'), pngs.get(512));

// --- ICO: header + directory entries + raw PNG payloads -------------------
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // image type: icon
icoHeader.writeUInt16LE(ICO_SIZES.length, 4);

const icoEntries = [];
let icoOffset = 6 + ICO_SIZES.length * 16;
for (const size of ICO_SIZES) {
  const png = pngs.get(size);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(icoOffset, 12);
  icoEntries.push(entry);
  icoOffset += png.length;
}
writeFileSync(
  join(outDir, 'icon.ico'),
  Buffer.concat([
    icoHeader,
    ...icoEntries,
    ...ICO_SIZES.map((size) => pngs.get(size)),
  ]),
);

// --- ICNS: modern PNG-backed types only -----------------------------------
const ICNS_TYPES = [
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
];

const icnsChunks = ICNS_TYPES.map(([type, size]) => {
  const png = pngs.get(size);
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([head, png]);
});

const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns', 0, 'ascii');
icnsHeader.writeUInt32BE(
  8 + icnsChunks.reduce((total, chunk) => total + chunk.length, 0),
  4,
);
writeFileSync(
  join(outDir, 'icon.icns'),
  Buffer.concat([icnsHeader, ...icnsChunks]),
);

console.log(
  `icons written: ${SIZES.length} png sizes + icon.ico + icon.icns -> ${outDir}`,
);
