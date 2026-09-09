'use client';

import { getV6Supabase } from './v6Supabase';

export function subscribeV6OrderDetails(orderId: string, onChange: () => void) {
  const channel = getV6Supabase().channel(`manito-v6-details-${orderId}`);
  for (const table of ['order_proposals', 'order_extras', 'payments', 'order_photos']) {
    channel.on('postgres_changes', {
      event: '*', schema: 'public', table, filter: `order_id=eq.${orderId}`,
    }, onChange);
  }
  // Re-query after joining/rejoining so events missed while offline are recovered.
  channel.on('system', {}, (payload) => {
    if (payload.extension === 'postgres_changes' && payload.status === 'ok') onChange();
  });
  channel.subscribe();
  return channel;
}
