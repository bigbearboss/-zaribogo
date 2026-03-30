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
  const tossSecretKey = Deno.env.get("TOSS_SECRET_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey || !tossSecretKey) {
    return jsonResponse(
      {
        success: false,
        error: "Missing required environment variables",
      },
      500
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let paymentIdForLogging: string | null = null;
  let orderIdForLogging = "unknown";

  try {
    const requestBody = await req.json().catch(() => null);
    const paymentKey = requestBody?.paymentKey;
    const orderId = requestBody?.orderId;
    const amount = requestBody?.amount;

    if (typeof orderId === "string") {
      orderIdForLogging = orderId;
    }

    await logPaymentEvent({
      supabaseAdmin,
      orderId: orderIdForLogging,
      eventType: "payment_confirm_requested",
      source: "confirm_toss_payment",
      payload: {
        requestBody,
      },
    });

    if (!paymentKey || typeof paymentKey !== "string") {
      await logPaymentEvent({
        supabaseAdmin,
        orderId: orderIdForLogging,
        eventType: "payment_confirm_validation_failed",
        source: "confirm_toss_payment",
        payload: {
          reason: "paymentKey is required",
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "paymentKey is required",
        },
        400
      );
    }

    if (!orderId || typeof orderId !== "string") {
      await logPaymentEvent({
        supabaseAdmin,
        orderId: orderIdForLogging,
        eventType: "payment_confirm_validation_failed",
        source: "confirm_toss_payment",
        payload: {
          reason: "orderId is required",
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "orderId is required",
        },
        400
      );
    }

    if (typeof amount !== "number" || Number.isNaN(amount)) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "payment_confirm_validation_failed",
        source: "confirm_toss_payment",
        payload: {
          reason: "amount must be a valid number",
          amount,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "amount must be a valid number",
        },
        400
      );
    }

    // 1) DB payment 조회
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle<PaymentRow>();

    if (paymentError) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "payment_lookup_failed",
        source: "confirm_toss_payment",
        payload: {
          error: paymentError.message,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to fetch payment",
          detail: paymentError.message,
        },
        500
      );
    }

    if (!payment) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "payment_not_found",
        source: "confirm_toss_payment",
        payload: {
          paymentKey,
          amount,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Payment not found",
        },
        404
      );
    }

    paymentIdForLogging = payment.id;

    if (payment.amount !== amount) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "payment_amount_mismatch",
        source: "confirm_toss_payment",
        payload: {
          dbAmount: payment.amount,
          requestAmount: amount,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Amount mismatch before Toss confirm",
          detail: {
            dbAmount: payment.amount,
            requestAmount: amount,
          },
        },
        400
      );
    }

    // 2) 이미 paid면 그대로 성공 반환
    if (payment.status === "paid") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "payment_already_processed",
        source: "confirm_toss_payment",
        payload: {
          status: payment.status,
          pg_tid: payment.pg_tid,
          paid_at: payment.paid_at,
        },
      });

      return jsonResponse({
        success: true,
        message: "Payment already processed",
        data: {
          orderId,
          payment,
        },
      });
    }

    // 3) Toss 승인 API 호출
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "toss_confirm_requested",
      source: "confirm_toss_payment",
      payload: {
        paymentKey,
        amount,
      },
    });

    const encodedSecretKey = btoa(`${tossSecretKey}:`);

    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodedSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount,
      }),
    });

    const tossResult = await tossResponse.json();

    if (!tossResponse.ok) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "toss_confirm_failed",
        source: "confirm_toss_payment",
        payload: tossResult,
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss confirm failed",
          detail: tossResult,
        },
        400
      );
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "toss_confirm_succeeded",
      source: "confirm_toss_payment",
      payload: tossResult,
    });

    // 4) Toss 응답 재검증
    if (tossResult.orderId !== orderId) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "toss_order_id_mismatch",
        source: "confirm_toss_payment",
        payload: {
          expected: orderId,
          actual: tossResult.orderId,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss orderId mismatch",
          detail: {
            expected: orderId,
            actual: tossResult.orderId,
          },
        },
        400
      );
    }

    if (Number(tossResult.totalAmount) !== amount) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "toss_total_amount_mismatch",
        source: "confirm_toss_payment",
        payload: {
          expected: amount,
          actual: tossResult.totalAmount,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss totalAmount mismatch",
          detail: {
            expected: amount,
            actual: tossResult.totalAmount,
          },
        },
        400
      );
    }

    if (tossResult.status !== "DONE") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "toss_status_not_done",
        source: "confirm_toss_payment",
        payload: {
          status: tossResult.status,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss payment is not completed",
          detail: tossResult.status,
        },
        400
      );
    }

    // 5) 기존 RPC 호출
    const paidAt = tossResult.approvedAt || new Date().toISOString();

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
        eventType: "payment_rpc_failed",
        source: "confirm_toss_payment",
        payload: {
          error: rpcError.message,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "RPC Error",
          detail: rpcError.message,
        },
        500
      );
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "payment_rpc_succeeded",
      source: "confirm_toss_payment",
      payload: {
        rpcResult,
        paymentKey,
        paidAt,
      },
    });

    // 6) 처리 후 payment 재확인
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
        eventType: "payment_after_lookup_failed",
        source: "confirm_toss_payment",
        payload: {
          error: paymentAfterError.message,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to fetch payment after processing",
          detail: paymentAfterError.message,
        },
        500
      );
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "payment_confirm_completed",
      source: "confirm_toss_payment",
      payload: {
        finalStatus: paymentAfter?.status ?? null,
        pg_tid: paymentAfter?.pg_tid ?? null,
        paid_at: paymentAfter?.paid_at ?? null,
      },
    });

    return jsonResponse({
      success: true,
      message: "Toss payment confirmed successfully",
      data: {
        orderId,
        rpcResult,
        tossResult,
        paymentBefore: payment,
        paymentAfter,
      },
    });
  } catch (error) {
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: paymentIdForLogging,
      orderId: orderIdForLogging,
      eventType: "payment_confirm_unexpected_error",
      source: "confirm_toss_payment",
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    return jsonResponse(
      {
        success: false,
        error: "Unexpected error",
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
});
