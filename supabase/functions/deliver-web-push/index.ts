import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";

type Delivery = {
  delivery_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  payload: Record<string, unknown>;
  attempt: number;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function finish(id: string, status: "sent" | "failed" | "expired", code?: string) {
  const { error } = await admin.rpc("finish_push_delivery", {
    p_delivery_id: id,
    p_status: status,
    p_error_code: code || null,
  });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { data: configRows, error: configError } = await admin.rpc("get_web_push_server_config");
  const config = configRows?.[0];
  if (configError || !config?.public_key || !config?.private_key || !config?.subject) {
    return Response.json({ ok: false, reason: "push_not_configured" }, { status: 503 });
  }

  webpush.setVapidDetails(config.subject, config.public_key, config.private_key);
  const { data, error } = await admin.rpc("claim_push_deliveries", { p_limit: 25 });
  if (error) return Response.json({ ok: false, reason: "claim_failed" }, { status: 500 });

  const deliveries = (data || []) as Delivery[];
  const results = await Promise.allSettled(deliveries.map(async (delivery) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: delivery.endpoint,
          keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret },
        },
        JSON.stringify(delivery.payload),
        { TTL: 300, urgency: "high" },
      );
      await finish(delivery.delivery_id, "sent");
      return "sent";
    } catch (caught) {
      const statusCode = Number((caught as { statusCode?: number }).statusCode || 0);
      const expired = statusCode === 404 || statusCode === 410;
      await finish(delivery.delivery_id, expired ? "expired" : "failed", statusCode ? `http_${statusCode}` : "send_error");
      return expired ? "expired" : "failed";
    }
  }));

  const summary = results.reduce<Record<string, number>>((counts, result) => {
    const key = result.status === "fulfilled" ? result.value : "failed";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return Response.json({ ok: true, claimed: deliveries.length, ...summary });
});
