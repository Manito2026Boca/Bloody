import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = [
  'supabase/migrations/20260902162000_norm_011_evidence_flow.sql',
  'supabase/migrations/20260902170000_norm_011_evidence_indexes.sql',
]
  .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
  .join('\n')
  .toLowerCase();

const api = readFileSync(join(process.cwd(), 'app/lib/v6Api.ts'), 'utf8').toLowerCase();
const component = readFileSync(join(process.cwd(), 'app/components/ManitoV6App.tsx'), 'utf8').toLowerCase();
const types = readFileSync(join(process.cwd(), 'app/lib/v6Types.ts'), 'utf8').toLowerCase();

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('NORM-011 evidence flow', () => {
  it('normalizes order_photos to a single stage/caption model', () => {
    expect(migration).toContain('rename column kind to stage');
    expect(migration).toContain('drop column kind');
    expect(migration).toContain('add column if not exists caption text');
    expect(migration).toContain("check (stage in ('before', 'during', 'after'))");
    expect(migration).toContain('order_photos_caption_length');
    expect(migration).toContain('order_photos_file_path_present');
    expect(migration).toContain('idx_order_photos_order_stage_created');
    expect(migration).toContain('idx_order_photos_uploaded_by');
    expect(types).toContain("stage: 'before' | 'during' | 'after'");
    expect(types).toContain('file_name: string | null');
    expect(types).toContain('caption: string | null');
    expect(api).not.toContain('kind: input.stage');
  });

  it('moves evidence mutations behind RPCs and keeps direct table writes closed', () => {
    expect(migration).toContain('revoke all on public.order_photos from anon, authenticated');
    expect(migration).toContain('grant select on public.order_photos to authenticated');
    expect(migration).toContain('drop policy if exists order_photos_insert_participants');
    expect(migration).toContain('function public.add_order_evidence');
    expect(migration).toContain('function public.list_order_evidence');
    expect(api).toContain(".rpc('add_order_evidence'");
    expect(api).toContain(".rpc('list_order_evidence'");
    expect(api).not.toContain(".from('order_photos')\n    .insert");
  });

  it('validates uploader, participant, path ownership, stage, caption and per-stage limit', () => {
    const addBlock = blockBetween(
      'create function public.add_order_evidence',
      'drop function if exists public.list_order_evidence',
    );
    expect(addBlock).toContain('v_uid uuid := auth.uid()');
    expect(addBlock).toContain("v_stage not in ('before', 'during', 'after')");
    expect(addBlock).toContain('char_length(v_caption) > 240');
    expect(addBlock).toContain("'^orders/' || p_order_id::text || '/evidence/' || v_uid::text");
    expect(addBlock).toContain('o.client_id = v_uid');
    expect(addBlock).toContain('o.professional_id = v_uid');
    expect(addBlock).toContain('so.bucket_id = \'manito-media\'');
    expect(addBlock).toContain('so.owner = v_uid');
    expect(addBlock).toContain('v_count >= v_limit');
    expect(migration).toContain("'max_files_per_stage', 6");
  });

  it('enforces simple stage/state rules without allowing closed-order uploads', () => {
    const addBlock = blockBetween(
      'create function public.add_order_evidence',
      'drop function if exists public.list_order_evidence',
    );
    expect(addBlock).toContain("v_order.status in ('completed', 'cancelled', 'matching_failed')");
    expect(addBlock).toContain("v_stage = 'before'");
    expect(addBlock).toContain("'open', 'scheduled_open', 'waiting_quotes', 'payment_pending', 'accepted', 'en_camino', 'en_sitio'");
    expect(addBlock).toContain("v_stage = 'during'");
    expect(addBlock).toContain("'accepted', 'en_camino', 'en_sitio', 'trabajando'");
    expect(addBlock).toContain("v_stage = 'after'");
    expect(addBlock).toContain("v_order.professional_id is distinct from v_uid");
    expect(addBlock).toContain("v_order.status <> 'trabajando'");
  });

  it('requires after evidence on complete_order only when the service requires it', () => {
    const completeBlock = blockBetween(
      'create or replace function private.complete_order_impl',
      'drop policy if exists manito_media_select_own',
    );
    expect(migration).toContain('requires_completion_evidence boolean not null default false');
    expect(completeBlock).toContain('s.requires_completion_evidence');
    expect(completeBlock).toContain("op.stage = 'after'");
    expect(completeBlock).toContain('op.uploaded_by = v_uid');
    expect(completeBlock).toContain("raise exception 'agregá al menos una foto del trabajo terminado antes de finalizar.'");
    expect(completeBlock).toContain("o.end_pin = btrim(coalesce(p_pin, ''))");
    expect(completeBlock).toContain("status = 'completed'");
  });

  it('keeps private Storage, signed URLs and orphan cleanup bounded', () => {
    const selectPolicy = blockBetween(
      'create policy manito_media_select_own',
      'drop policy if exists manito_media_delete_unlinked_own',
    );
    const deletePolicy = blockBetween(
      'create policy manito_media_delete_unlinked_own',
      'grant delete on storage.objects to authenticated',
    );
    expect(selectPolicy).toContain("bucket_id = 'manito-media'");
    expect(selectPolicy).toContain('private.is_manito_admin()');
    expect(selectPolicy).toContain('o.client_id = (select auth.uid())');
    expect(selectPolicy).toContain('o.professional_id = (select auth.uid())');
    expect(deletePolicy).toContain('owner = (select auth.uid())');
    expect(deletePolicy).toContain('not exists');
    expect(api).toContain('createsignedurl(filepath, 600)');
    expect(api).toContain("remove(filepath");
    expect(api).toContain('uploadv6orderevidencefile');
    expect(api).toContain('orders/${input.orderid}/evidence/${input.ownerid}');
  });

  it('keeps the UI simple and role-aware for client and professional evidence', () => {
    expect(component).toContain('evidencestageoptions');
    expect(component).toContain("{ value: 'before', label: 'antes' }");
    expect(component).toContain("{ value: 'during', label: 'durante' }");
    expect(component).toContain("{ value: 'after', label: 'trabajo terminado' }");
    expect(component).toContain('v6-evidence-groups');
    expect(component).toContain('photosbystage');
    expect(component).toContain('requires_completion_evidence');
    expect(component).toContain('agregá al menos una foto del trabajo terminado antes de finalizar.');
    expect(component).not.toContain('<option value=\"after\">después</option>');
  });
});
