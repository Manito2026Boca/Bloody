'use client';

import { getV6Supabase } from './v6Supabase';
import type { V6Complaint, V6ComplaintContext, V6ComplaintEvidence } from './v6Types';

export async function respondToV6Complaint(complaintId: string, response: string) {
  const { data, error } = await getV6Supabase().rpc('respond_to_complaint', { p_complaint_id: complaintId, p_response: response });
  if (error) throw new Error(error.message);
  return data as V6Complaint;
}

export async function getV6ComplaintContext(complaintId: string) {
  const { data, error } = await getV6Supabase().rpc('get_admin_complaint_detail', { p_complaint_id: complaintId });
  if (error) throw new Error(error.message);
  return data as V6ComplaintContext;
}

export async function listV6ComplaintEvidence(complaintId: string) {
  const { data, error } = await getV6Supabase().from('complaint_evidence').select('*').eq('complaint_id', complaintId).order('created_at');
  if (error) throw new Error(error.message);
  return (data || []) as V6ComplaintEvidence[];
}

export async function uploadV6ComplaintEvidence(complaintId: string, userId: string, file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
    throw new Error('Elegí una imagen JPG, PNG, WebP o un PDF de hasta 10 MB.');
  }
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.type];
  const path = `complaints/${complaintId}/${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await getV6Supabase().storage.from('manito-media').upload(path, file, { upsert: false, contentType: file.type });
  if (uploadError) throw new Error('No pudimos subir el archivo. Probá nuevamente.');
  const { data, error } = await getV6Supabase().rpc('add_complaint_evidence', {
    p_complaint_id: complaintId, p_file_path: path, p_file_name: file.name.slice(0, 255), p_caption: null,
  });
  if (error) throw new Error(error.message);
  return data as V6ComplaintEvidence;
}

export function subscribeV6Complaints(orderId: string | null, refresh: () => void) {
  return getV6Supabase().channel(`protection-${orderId || 'admin'}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints', ...(orderId ? { filter: `order_id=eq.${orderId}` } : {}) }, refresh)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaint_evidence' }, refresh)
    .subscribe();
}
