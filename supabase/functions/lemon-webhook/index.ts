import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lemon-squeezy-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

async function logPaymentEvent(params: {
  supabaseAdmin: any;
  paymentId?: string | null;
  orderId: string;
  eventType: string;
  source: string;
  payload?: unknown;
}) {
  const { supabaseAdmin, paymentId, orderId, eventType, source, payload } = params;

  await supabaseAdmin.from("payment_events").insert({
    payment_id: paymentId ?? null,
    order_id: orderId,
    event_type: eventType,
    source,
    payload_json: payload ?? null,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method Not Allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    const payload = await req.json();
    const eventName = payload?.meta?.event_name;
    const data = payload?.data;
    const attributes = data?.attributes;
    const customData = payload?.meta?.custom_data;

    const orderIdentifier = attributes?.identifier || String(data?.id || "unknown");
    const userId = customData?.user_id;
    const productId = customData?.product_id;
    
    // total is the actual paid amount in the currency's base unit
    const actualAmount = Math.round(Number(attributes?.total ?? 0)); 

    await logPaymentEvent({
      supabaseAdmin,
      orderId: orderIdentifier,
      eventType: `lemon_${eventName}`,
      source: "lemon_webhook",
      payload,
    });

    if (eventName !== "order_created" && eventName !== "order_paid") {
      return jsonResponse({ success: true, message: `Ignored event: ${eventName}` });
    }

    let { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("order_id", orderIdentifier)
      .maybeSingle();

    if (!payment) {
      const { data: newPayment, error: insertError } = await supabaseAdmin
        .from("payments")
        .insert({
          user_id: userId,
          product_id: productId,
          order_id: orderIdentifier,
          amount: actualAmount,
          status: "pending",
          pg_provider: "lemonsqueezy",
          pg_tid: String(data?.id)
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create payment record: ${insertError.message}`);
      }
      payment = newPayment;
    }

    if (payment.status === "paid") {
      return jsonResponse({ success: true, message: "Already processed" });
    }

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "process_successful_payment",
      {
        p_order_id: orderIdentifier,
        p_pg_tid: String(data?.id),
        p_paid_at: attributes?.created_at || new Date().toISOString(),
      }
    );

    if (rpcError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId: orderIdentifier,
        eventType: "lemon_rpc_failed",
        source: "lemon_webhook",
        payload: { error: rpcError.message },
      });
      throw new Error(`RPC failed: ${rpcError.message}`);
    }

    return jsonResponse({ success: true, message: "Order processed successfully" });

  } catch (error) {
    console.error("[lemon-webhook error]", error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
