// After `vite build`: make every address open the app, whatever the host.
//  - dist/404.html: hosts (Wasmer static-web-server, GitHub Pages, Firebase…) show it for unknown paths.
//  - dist/<page>/index.html for the public pages, so QR codes and SMS links always get a normal page.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url);
const html = readFileSync(new URL('index.html', dist), 'utf8');
copyFileSync(new URL('index.html', dist), new URL('404.html', dist));
for (const page of ['join', 'visit', 'prayer', 'pay', 'charity-give', 'login']) {
  mkdirSync(new URL(`${page}/`, dist), { recursive: true });
  writeFileSync(new URL(`${page}/index.html`, dist), html);
}
console.log('SPA fallback pages written (404.html + public pages).');
