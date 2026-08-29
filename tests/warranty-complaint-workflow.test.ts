import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/202608280004_warranty_complaint_workflow.sql'),
  'utf8',
).toLowerCase();

const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8').toLowerCase();

describe('MANITO warranty complaint workflow', () => {
  it('moves complaint writes behind participant and admin RPCs', () => {
    expect(migration).toContain('function public.open_order_complaint');
    expect(migration).toContain('function public.review_order_complaint');
    expect(migration).toContain('function public.list_admin_complaint_reviews()');
    expect(migration).toContain('revoke all on public.complaints from anon, authenticated');
    expect(migration).toContain('grant select on public.complaints to authenticated');
  });

  it('only opens warranty cases for participants on completed orders within guarantee time', () => {
    expect(migration).toContain('and (o.client_id = v_uid or o.professional_id = v_uid)');
    expect(migration).toContain("if v_order.status <> 'completed' then");
    expect(migration).toContain("raise exception 'la garantía se abre cuando el trabajo está finalizado'");
    expect(migration).toContain('make_interval(days => coalesce(v_order.guarantee_days, 7))');
  });

  it('requires MANITO admin to resolve warranty cases', () => {
    expect(migration).toContain('if v_uid is null or not private.is_manito_admin(v_uid) then');
    expect(migration).toContain("v_status not in ('in_review', 'resolved', 'rejected')");
    expect(migration).toContain('resolution_note = nullif');
    expect(migration).toContain('reviewed_by = v_uid');
  });

  it('uses warranty RPCs from the frontend API', () => {
    expect(api).toContain('open_order_complaint');
    expect(api).toContain('review_order_complaint');
    expect(api).toContain('list_admin_complaint_reviews');
    expect(api).not.toContain(".from('complaints')\n    .insert");
  });
});
