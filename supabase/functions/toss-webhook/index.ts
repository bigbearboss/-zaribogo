import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

type PaymentRow = {
  id: string;
  user_id: string | null;
  product_id: string | null;
  order_id: string;
  amount: number;
  status: string;
  pg_tid: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

async function logPaymentEvent(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  paymentId?: string | null;
  orderId: string;
  eventType: string;
  source: string;
  payload?: unknown;
}) {
  const { supabaseAdmin, paymentId, orderId, eventType, source, payload } = params;

  const { error } = await supabaseAdmin.from("payment_events").insert({
    payment_id: paymentId ?? null,
    order_id: orderId,
    event_type: eventType,
    source,
    payload_json: payload ?? null,
  });

  if (error) {
    console.error("[payment_events insert error]", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method Not Allowed",
      },
      405
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        error: "Missing required environment variables",
      },
      500
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let orderIdForLogging = "unknown";
  let paymentIdForLogging: string | null = null;

  try {
    const payload = await req.json().catch(() => null);

    const eventType = payload?.eventType ?? payload?.type ?? "unknown";
    const data = payload?.data ?? payload ?? {};
    const orderId = data?.orderId ?? data?.order_id ?? "unknown";
    const paymentKey = data?.paymentKey ?? data?.payment_key ?? null;
    const totalAmount = Number(data?.totalAmount ?? data?.amount ?? 0);
    const status = data?.status ?? null;
    const approvedAt = data?.approvedAt ?? null;

    orderIdForLogging = orderId;

    await logPaymentEvent({
      supabaseAdmin,
      orderId,
      eventType: "webhook_received",
      source: "toss_webhook",
      payload,
    });

    if (!orderId || orderId === "unknown") {
      await logPaymentEvent({
        supabaseAdmin,
        orderId: "unknown",
        eventType: "webhook_missing_order_id",
        source: "toss_webhook",
        payload,
      });

      return jsonResponse({
        success: true,
        message: "Webhook received without orderId",
      });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle<PaymentRow>();

    if (paymentError) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "webhook_payment_lookup_failed",
        source: "toss_webhook",
        payload: {
          error: paymentError.message,
        },
      });

      return jsonResponse({
        success: true,
        message: "Webhook received but payment lookup failed",
      });
    }

    if (!payment) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "webhook_payment_not_found",
        source: "toss_webhook",
        payload,
      });

      return jsonResponse({
        success: true,
        message: "Webhook received but payment not found",
      });
    }

    paymentIdForLogging = payment.id;

    // 이미 처리된 주문이면 로그만 남기고 종료
    if (payment.status === "paid") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "webhook_payment_already_processed",
        source: "toss_webhook",
        payload: {
          status: payment.status,
          pg_tid: payment.pg_tid,
          paid_at: payment.paid_at,
          webhookStatus: status,
        },
      });

      return jsonResponse({
        success: true,
        message: "Payment already processed",
      });
    }

    // DONE 상태일 때만 보정 처리
    if (status !== "DONE") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "webhook_ignored_non_done_status",
        source: "toss_webhook",
        payload: {
          status,
          totalAmount,
        },
      });

      return jsonResponse({
        success: true,
        message: "Webhook ignored for non-DONE status",
      });
    }

    // 금액 불일치면 처리 중단
    if (payment.amount !== totalAmount) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "webhook_amount_mismatch",
        source: "toss_webhook",
        payload: {
          dbAmount: payment.amount,
          webhookAmount: totalAmount,
        },
      });

      return jsonResponse({
        success: true,
        message: "Webhook received but amount mismatch",
      });
    }

    // success 페이지 누락 시 보정 처리
    const paidAt = approvedAt || new Date().toISOString();

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "process_successful_payment",
      {
        p_order_id: orderId,
        p_pg_tid: paymentKey,
        p_paid_at: paidAt,
      }
    );

    if (rpcError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "webhook_rpc_failed",
        source: "toss_webhook",
        payload: {
          error: rpcError.message,
          paymentKey,
          paidAt,
        },
      });

      return jsonResponse({
        success: true,
        message: "Webhook received but RPC failed",
      });
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "webhook_rpc_succeeded",
      source: "toss_webhook",
      payload: {
        rpcResult,
        paymentKey,
        paidAt,
      },
    });

    const { data: paymentAfter, error: paymentAfterError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle<PaymentRow>();

    if (paymentAfterError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "webhook_payment_after_lookup_failed",
        source: "toss_webhook",
        payload: {
          error: paymentAfterError.message,
        },
      });

      return jsonResponse({
        success: true,
        message: "Webhook processed but after-lookup failed",
      });
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "webhook_processing_completed",
      source: "toss_webhook",
      payload: {
        finalStatus: paymentAfter?.status ?? null,
        pg_tid: paymentAfter?.pg_tid ?? null,
        paid_at: paymentAfter?.paid_at ?? null,
      },
    });

    return jsonResponse({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: paymentIdForLogging,
      orderId: orderIdForLogging,
      eventType: "webhook_unexpected_error",
      source: "toss_webhook",
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return jsonResponse({
      success: true,
      message: "Webhook received with unexpected error logged",
    });
  }
});