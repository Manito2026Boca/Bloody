const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const brand = resolve(root, 'public', 'brand');

function svgDataUrl(file) {
  const svg = readFileSync(resolve(brand, file), 'utf8');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function renderImage(page, input, output, width, height, background = 'transparent') {
  await page.setViewportSize({ width, height });
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${background}}img{display:block;width:100%;height:100%;object-fit:contain}</style><img src="${svgDataUrl(input)}" alt="">`);
  await page.screenshot({ path: resolve(brand, output), omitBackground: background === 'transparent' });
}

(async () => {
  mkdirSync(brand, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  try {
    await renderImage(page, 'manito-app-icon.svg', 'manito-icon-192.png', 192, 192);
    await renderImage(page, 'manito-app-icon.svg', 'manito-icon-512.png', 512, 512);
    await renderImage(page, 'manito-app-icon.svg', 'manito-maskable-512.png', 512, 512);
    await renderImage(page, 'manito-app-icon.svg', 'apple-touch-icon.png', 180, 180, '#073f3d');
    await renderImage(page, 'manito-favicon.svg', 'manito-favicon-64.png', 64, 64);

    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fffdfa}body{display:grid;place-items:center}img{display:block;width:900px;height:auto}</style><img src="${svgDataUrl('manito-logo.svg')}" alt="MANITO">`);
    await page.screenshot({ path: resolve(brand, 'manito-social.png') });
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
