import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MANITO app entrypoint', () => {
  it('uses the V6 mobile app as the only routed product surface', () => {
    const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

    expect(page).toContain("import ManitoV6App from './components/ManitoV6App'");
    expect(page).toContain('return <ManitoV6App />');
    expect(page).not.toContain('ManitoApp');
  });
});
