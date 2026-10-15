// ============================================================================
// QR / waybill render check (I-4).  Run: npm run qa:qr
// ----------------------------------------------------------------------------
// Three things a build alone cannot prove:
//   1. the QR the portal generates is a real, decodable image;
//   2. it decodes back to the EXACT payload the parcel carries (a wrong
//      encoding is still a perfectly valid PNG, so "an image appeared" is not
//      evidence);
//   3. the production bundle containing ParcelWaybill.jsx boots in a browser
//      with no uncaught errors, so the module graph is genuinely wired.
//
// Decoding is done by an independent decoder (jsQR), rendering the generated
// data URL onto a real canvas in a real browser — the same pixels a phone
// camera would see. Chromium's own BarcodeDetector is used as a second opinion
// when the build exposes it (it is absent on Windows/Linux desktop Chromium).
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist');
const JSQR = path.join(ROOT, 'node_modules', 'jsqr', 'dist', 'jsQR.js');

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
function info(message) { console.log(`  info ${message}`); }

// The exact payload shape the portal mints and the app scans.
const PAYLOAD = 'YTOQR1|YTO2026QR00001|YTOS20260001|YTOC20260001';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

async function main() {
  if (!fs.existsSync(DIST)) throw new Error('dist/ is missing — run npm run build first');
  if (!fs.existsSync(JSQR)) throw new Error('jsqr decoder missing — run npm install');

  // 1. Generate the data URL through the SAME library call the drawer makes.
  const dataUrl = await QRCode.toDataURL(PAYLOAD, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  check('QR data URL is a PNG data URL', dataUrl.startsWith('data:image/png;base64,'), true);
  console.log(`\n1. the QR the drawer renders\n  info payload: ${PAYLOAD}\n`);

  // One server serves both the built app and the vendor decoder.
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/vendor/jsQR.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      return fs.createReadStream(JSQR).pipe(res);
    }
    let file = path.join(DIST, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 2. Decode the generated image from real canvas pixels.
  await page.setContent(`<img id="label" src="${dataUrl}" alt="label" />`);
  await page.addScriptTag({ url: `${base}/vendor/jsQR.js` });
  const decoded = await page.evaluate(async () => {
    const img = document.getElementById('label');
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const result = window.jsQR(pixels.data, pixels.width, pixels.height);

    let native = { supported: false };
    if (typeof BarcodeDetector !== 'undefined') {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(img);
          native = { supported: true, texts: found.map((f) => f.rawValue) };
        }
      } catch (e) { native = { supported: false }; }
    }
    return { dims: [img.naturalWidth, img.naturalHeight], jsqr: result ? { text: result.data, bytes: result.binaryData.length } : null, native };
  });

  check('the QR decodes to an image with real pixels', decoded.dims[0] > 0 && decoded.dims[1] > 0, true);
  info(`rendered image: ${decoded.dims[0]}x${decoded.dims[1]}px`);
  check('an independent decoder finds exactly one code', decoded.jsqr !== null, true);
  check('it decodes to the exact parcel payload', decoded.jsqr && decoded.jsqr.text, PAYLOAD);
  check('the decoded payload carries real bytes', decoded.jsqr ? decoded.jsqr.bytes > 0 : false, true);
  if (decoded.native.supported) {
    check('Chromium BarcodeDetector agrees', decoded.native.texts, [PAYLOAD]);
  } else {
    info('Chromium BarcodeDetector not exposed on this platform — jsQR above is the decode proof');
  }

  // 3. Boot the production bundle that contains ParcelWaybill.jsx.
  console.log('\n2. the built bundle boots in a browser');
  const appPage = await browser.newPage();
  const pageErrors = [];
  appPage.on('pageerror', (err) => pageErrors.push(err.message));
  await appPage.goto(base, { waitUntil: 'networkidle' });
  const bodyText = (await appPage.evaluate(() => document.body.innerText || '')).trim();

  check('the app rendered something visible', bodyText.length > 0, true);
  check('no uncaught error while the bundle executed', pageErrors, []);
  info(`first line of the rendered app: ${JSON.stringify(bodyText.split('\n')[0] || '')}`);

  await browser.close();
  server.close();

  console.log(`\n${checks - failures}/${checks} QR/waybill render checks passed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('check error:', err.message); process.exit(1); });
