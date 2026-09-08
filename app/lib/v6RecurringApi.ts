import { getV6Supabase } from './v6Supabase';
import type { V6RecurringServicePlan } from './v6Types';

export type RecurringPlanChanges = Partial<Pick<V6RecurringServicePlan,
  'frequency' | 'preferred_professional_id' | 'description' | 'address' |
  'client_lat' | 'client_lng' | 'estimated_duration_minutes'>> & { scheduled_at?: string };

export type AdminRecurringPlan = Pick<V6RecurringServicePlan, 'id' | 'status' | 'next_scheduled_at' | 'generation_error'> &
  { client_name: string; service_name: string; latest_order_id: string | null; last_generation_attempt_at: string | null };

export async function listAdminRecurringPlans(): Promise<AdminRecurringPlan[]> {
  const { data, error } = await getV6Supabase().rpc('list_admin_recurring_plans');
  if (error) throw new Error('No pudimos cargar la revisión de recurrencias.');
  return data || [];
}

export async function listRecurringPlans(): Promise<V6RecurringServicePlan[]> {
  const { data, error } = await getV6Supabase().rpc('list_my_recurring_plans');
  if (error) throw new Error('No pudimos cargar tus servicios recurrentes. Probá nuevamente.');
  return data || [];
}

export async function updateRecurringPlan(id: string, changes: RecurringPlanChanges): Promise<void> {
  const { error } = await getV6Supabase().rpc('update_recurring_plan', { p_plan_id: id, p_changes: changes });
  if (error) throw new Error('No pudimos guardar el plan. Revisá la fecha y el profesional elegido.');
}

export async function changeRecurringPlanStatus(id: string, action: 'pause' | 'resume' | 'cancel'): Promise<void> {
  const rpc = { pause: 'pause_recurring_plan', resume: 'resume_recurring_plan', cancel: 'cancel_recurring_plan' } as const;
  const { error } = await getV6Supabase().rpc(rpc[action], { p_plan_id: id });
  if (error) throw new Error('No pudimos actualizar el plan. Probá nuevamente.');
}
