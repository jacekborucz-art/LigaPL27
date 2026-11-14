// Uzupełnia listę plików trybu offline w sw.js (blok między znacznikami AUTO-FILES).
// Uruchom: npm run sw
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'assets'))]
  .map((f) => `./${path.relative(root, f).split(path.sep).join('/')}`)
  .filter((f) => /\.(js|css|json|woff2|webp|png|svg)$/.test(f))
  .sort();

const swPath = path.join(root, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const start = '// AUTO-FILES-START';
const end = '// AUTO-FILES-END';
const i = sw.indexOf(start);
const j = sw.indexOf(end);
if (i < 0 || j < 0) throw new Error('Brak znaczników AUTO-FILES w sw.js');
const block = `${start}\n${files.map((f) => `  '${f}',`).join('\n')}\n  ${end}`;
// Wersja pamięci podręcznej z zawartości plików gry: każda zmiana kodu daje nową wersję, stara pamięć jest usuwana
const crypto = require('crypto');
const h = crypto.createHash('sha1');
for (const f of [...files, './index.html', './manifest.webmanifest']) { const fp = path.join(root, f); if (fs.existsSync(fp)) h.update(f).update(fs.readFileSync(fp)); }
const version = `v0.3-${h.digest('hex').slice(0, 10)}`;
const out = (sw.slice(0, i) + block + sw.slice(j + end.length)).replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, out);
console.log(`sw.js: ${files.length} plików w trybie offline, wersja ${version}`);
