import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/visitors', { recursive: true });
for (const file of await readdir('.')) {
  if (/\.(html|css|js|txt|xml)$/.test(file)) {
    if (file.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      await writeFile(`dist/${file}`, html.replace('</head>', '    <link rel="stylesheet" href="/replay-consent.css">\n    <script type="module" src="/replay-consent.js"></script>\n</head>'));
    } else await cp(file, `dist/${file}`);
  }
}
for (const dir of ['images', 'videos']) await cp(dir, `dist/${dir}`, { recursive: true, filter: p => !p.endsWith('.DS_Store') });
await cp('admin/index.html', 'dist/visitors/index.html');
await cp('admin/style.css', 'dist/visitors/style.css');
await cp('replay/consent.css', 'dist/replay-consent.css');
await cp('node_modules/rrweb-player/dist/style.css', 'dist/visitors/player.css');
await build({ entryPoints: { 'replay-consent': 'replay/consent.js', 'replay-recorder': 'replay/recorder.js', 'visitors/dashboard': 'admin/dashboard.js' }, outdir: 'dist', bundle: true, splitting: true, minify: true, format: 'esm', target: ['es2022'], legalComments: 'eof' });
console.log('Built website and private visitor dashboard.');
