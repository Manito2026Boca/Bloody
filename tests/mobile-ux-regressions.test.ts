import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const app = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8');

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match?.[1] || '';
}

describe('mobile UX regressions', () => {
  it('keeps the V6 app constrained to the viewport without forcing 100vw', () => {
    expect(cssRule('.v6-app')).toContain('width: 100%');

    const mobileStart = css.indexOf('@media (max-width: 430px)');
    const nextMedia = css.indexOf('@media', mobileStart + 1);
    const mobileMedia = css.slice(mobileStart, nextMedia === -1 ? undefined : nextMedia);
    const mobileAppRule = mobileMedia.match(/\.v6-app\s*\{([\s\S]*?)\n  \}/m)?.[1] || '';

    expect(mobileAppRule).toContain('width: 100%');
    expect(mobileAppRule).not.toContain('100vw');
  });

  it('keeps account benefit tiles wired to real actions', () => {
    for (const handler of [
      'copyReferralCode',
      'goToRecurringOrders',
      'shareActiveTracking',
      'focusTrustedContact',
    ]) {
      expect(app).toContain(`onClick={${handler}}`);
    }
    expect(app).toContain("onNavigate('favorites')");
  });

  it('keeps unavailable payment methods explanatory instead of silently selectable', () => {
    expect(app).toContain('aria-disabled={option.disabled}');
    expect(app).toContain('setNotice(option.detail)');
  });
});
