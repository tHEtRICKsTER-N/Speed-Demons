#!/usr/bin/env node
// Builds upload-ready zips in dist/:
//   speed-demons-poki.zip        -> Poki for Developers
//   speed-demons-crazygames.zip  -> CrazyGames developer portal
//   speed-demons-web.zip         -> your own site (GitHub Pages, Netlify, itch.io, ...)
// Each build pins the platform in index.html (<meta name="sd-platform">). No dependencies: node tools/package.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const GAME_FILES = ['index.html', 'icon.svg', 'css', 'js', 'vendor', 'fonts'];
const BUILDS = [
  { name: 'poki', platform: 'poki', manifest: false },
  { name: 'crazygames', platform: 'crazygames', manifest: false },
  { name: 'web', platform: 'web', manifest: true },
];

function listFiles(rel) {
  const abs = path.join(root, rel);
  if (fs.statSync(abs).isDirectory()) return fs.readdirSync(abs).sort().flatMap((f) => listFiles(path.posix.join(rel, f)));
  return [rel];
}

// ---- minimal zip writer (deflate, no extras)
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const time = 0; // fixed timestamps -> reproducible zips
  const date = (1 << 5) | 1; // 1980-01-01
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

fs.mkdirSync(dist, { recursive: true });
const files = GAME_FILES.flatMap(listFiles);
for (const b of BUILDS) {
  const entries = files.map((rel) => {
    let data = fs.readFileSync(path.join(root, rel));
    if (rel === 'index.html') {
      const html = data.toString('utf8');
      const pinned = html.replace('<meta name="sd-platform" content="auto">', `<meta name="sd-platform" content="${b.platform}">`);
      if (pinned === html) throw new Error('index.html: sd-platform meta tag not found');
      data = Buffer.from(pinned, 'utf8');
    }
    return { name: rel, data };
  });
  if (b.manifest) entries.push({ name: 'manifest.webmanifest', data: fs.readFileSync(path.join(root, 'manifest.webmanifest')) });
  const out = path.join(dist, `speed-demons-${b.name}.zip`);
  const buf = zip(entries);
  fs.writeFileSync(out, buf);
  const raw = entries.reduce((n, e) => n + e.data.length, 0);
  console.log(`${path.relative(root, out)}  ${entries.length} files, ${(buf.length / 1024).toFixed(0)} KB zipped (${(raw / 1024).toFixed(0)} KB unpacked)`);
}
