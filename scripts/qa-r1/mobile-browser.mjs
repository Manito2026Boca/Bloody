import assert from 'node:assert/strict';
import { runCases, openJobs, settle } from './harness.mjs';

export async function geometry(page) {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  return page.evaluate(() => {
    const box = element => { const r = element.getBoundingClientRect(); const css = getComputedStyle(element); return { tag: element.tagName, class: typeof element.className === 'string' ? element.className : '', x: r.x, y: r.y, width: r.width, right: r.right, height: r.height, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: css.overflowX, minWidth: css.minWidth, gridTemplateColumns: css.gridTemplateColumns }; };
    const cards = [...document.querySelectorAll('.v6-order, .v6-direct-request')].map(card => {
      const bounds = card.getBoundingClientRect();
      const visible = [...card.querySelectorAll('*')].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      return { card: box(card), escaped: visible.filter(element => { const r = element.getBoundingClientRect(); return r.right > bounds.right + 1 || r.x < bounds.x - 1; }).map(box).slice(0, 20), internalOverflow: visible.filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).display !== 'inline').map(box).slice(0, 20) };
    });
    return { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, cards, imageLoaded: [...document.querySelectorAll('img')].filter(image => image.getClientRects().length).every(image => image.complete && image.naturalWidth > 0) };
  });
}

const cases = [];
for (const [width, height] of [[360, 800], [390, 844], [1280, 900]]) {
  for (const actor of ['client', 'professional']) {
    for (const [scenario, long] of [['accepted', 'no'], ['accepted', 'yes'], ['manual', 'yes'], ['reservation', 'yes'], ['completed', 'yes']]) cases.push({
      name: `n6-${actor}-${width}-${scenario}-${long === 'yes' ? 'long' : 'normal'}`, width, height, query: { actor, long, scenario, response: actor === 'professional' && scenario === 'manual' ? 'pending' : 'expired' },
      async run(page, result) {
        await openJobs(page);
        if (scenario === 'completed') await page.getByRole('tab', { name: 'Historial', exact: true }).click();
        const cardSelector = scenario === 'manual' && actor === 'professional' ? '.v6-direct-request' : '.v6-order';
        await page.locator(cardSelector).waitFor();
        result.geometry = await geometry(page);
        const problems = [];
        const g = result.geometry;
        if (g.documentWidth > g.width + 1) problems.push(`document ${g.documentWidth} > viewport ${g.width}`);
        for (const row of g.cards) {
          if (row.card.right > g.width + 1 || row.card.x < -1) problems.push(`card outside viewport: x=${row.card.x}, right=${row.card.right}`);
          if (row.escaped.length) problems.push(`${row.escaped.length} descendants escape card`);
          const clipped = row.internalOverflow.filter(element => ['hidden', 'clip'].includes(element.overflowX));
          if (clipped.length) problems.push(`${clipped.length} descendants clip content`);
        }
        assert(g.imageLoaded, 'Visible repository images must render');
        const buttons = page.locator(`${cardSelector} button:visible`);
        result.controls = [];
        for (const control of await buttons.all()) {
          await control.scrollIntoViewIfNeeded();
          const hit = await control.evaluate(element => { const r = element.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const target = document.elementFromPoint(x, y); return { label: element.textContent.trim(), x: r.x, right: r.right, y: r.y, bottom: r.bottom, hit: !!target && (target === element || element.contains(target)), inViewport: r.x >= -1 && r.right <= innerWidth + 1 && r.y >= -1 && r.bottom <= innerHeight + 1 }; });
          result.controls.push(hit);
          if (!hit.hit || !hit.inViewport) problems.push(`Control clipped/covered: ${hit.label}`);
        }
        result.observations = { viewport: `${width}x${height}`, documentWidth: g.documentWidth, cardRight: g.cards[0]?.card.right, escaped: g.cards[0]?.escaped.length, internalOverflow: g.cards[0]?.internalOverflow.length };
        assert.deepEqual(problems, [], problems.join('; '));
      },
    });
  }
}
await runCases(cases);
