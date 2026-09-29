import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Generates the committed binary assets from their SVG sources.
 *
 * They are committed as binaries because social platforms will not render an SVG
 * og:image and browsers still request /favicon.ico unconditionally — but the SVG
 * sources stay in git, so both remain editable rather than being binaries nobody
 * can change.
 *
 * Run: pnpm assets:og
 */
const path = (p) => fileURLToPath(new URL(p, import.meta.url));

const og = await sharp(path('../src/assets/og-default.svg'))
  .png()
  .toFile(path('../public/og-default.png'));
console.log(`og-default.png: ${og.width}x${og.height}, ${og.size} bytes`);

// Chrome requests /favicon.ico regardless of <link rel="icon">, so a missing one
// is a guaranteed 404 on every page — which Lighthouse counts as a console error.
const png = await sharp(path('../src/assets/favicon.svg')).resize(32, 32).png().toBuffer();

// Minimal ICO container around a PNG: ICONDIR(6) + ICONDIRENTRY(16) + payload.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt8(0, 2); // palette size (0 = truecolour)
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12); // offset past header + entry
writeFileSync(path('../public/favicon.ico'), Buffer.concat([header, entry, png]));
console.log(`favicon.ico: 32x32, ${22 + png.length} bytes`);
