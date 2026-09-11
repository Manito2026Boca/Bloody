import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260909225833_prep_match_001_eligibility.sql', 'utf8');
const ui = readFileSync('app/components/ManitoV6App.tsx', 'utf8');
const api = readFileSync('app/lib/v6Api.ts', 'utf8');
const location = readFileSync('app/components/MatchingLocation.tsx', 'utf8');

describe('PREP-MATCH-001 integration contracts (SQL behavior covered by rollback suite)', () => {
  it('uses one predicate in invitations, opportunities, proposals and assignment', () => {
    for (const caller of ['private.order_professional_eligible(o,p.id)',
      'private.order_professional_eligible(o,v_uid)', 'private.order_professional_eligible(v_before,v_uid)',
      'private.order_professional_eligible(v_source_order,v_proposal.professional_id)',
      'private.order_professional_eligible(new,new.professional_id)']) expect(sql).toContain(caller);
  });
  it('does not use a city label or description as coverage/specialty identity', () => {
    const helper = sql.split('create function private.order_professional_eligible')[1].split('create or replace function')[0];
    expect(helper).not.toContain('work_city');
    expect(helper).not.toContain('description');
    expect(helper).toContain('c.location_id=p_order.location_id');
    expect(helper).toContain('sp.id=p_order.required_specialty_id');
    expect(helper).toContain('case when private.match_coordinates_valid');
  });
  it('keeps validation functions private and ownership on coverage', () => {
    expect(sql).toContain('professional_id=(select auth.uid())');
    expect(sql).toContain('private.enforce_order_assignment_eligibility() from public,anon,authenticated');
    expect(sql).toContain('revoke all on public.service_locations from public,anon,authenticated');
  });
  it('propagates requirements through all creation modes and recurring generation', () => {
    expect(api.match(/required_specialty_id: input.requiredSpecialtyId/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("'required_specialty_id',p.required_specialty_id");
    expect(sql).toContain('o.payment_method,o.location_id,o.required_specialty_id');
  });
  it('persists explicit selection, not a description edit', () => {
    expect(ui).toContain('aria-pressed={requiredSpecialtyId === specialty.id}');
    expect(ui).not.toContain('function addSpecialtyToRequest');
    expect(ui).toContain('requiredSpecialtyId,');
  });
  it('offers manual fallback and preserves coordinate zero', () => {
    expect(ui).toContain('if (!navigator.geolocation)');
    expect(ui).toContain('lat: coords?.lat ?? null');
    expect(ui).toContain('<MatchingLocation');
    expect(location).toContain('complete_order_location');
  });
  it('does not trust stale preview results or silently change manual assignment', () => {
    expect(ui).toContain('eligibleResult.key === eligibilityKey');
    expect(ui).toContain("assignmentMode === 'manual' && !selectedProfessionalCandidate");
  });
});
