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

type RefundRequestRow = {
  id: string;
  payment_id: string | null;
  order_id: string;
  user_id: string;
  cancel_reason: string | null;
  request_status: string;
  admin_note: string | null;
  created_at: string;
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

function buildTossBasicAuth(secretKey: string) {
  return `Basic ${btoa(`${secretKey}:`)}`;
}

async function cancelTossPayment(params: {
  secretKey: string;
  paymentKey: string;
  cancelReason: string;
  idempotencyKey: string;
}) {
  const { secretKey, paymentKey, cancelReason, idempotencyKey } = params;

  const response = await fetch(
    `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: buildTossBasicAuth(secretKey),
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        cancelReason,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
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
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const tossSecretKey = Deno.env.get("TOSS_SECRET_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        error: "Missing required Supabase environment variables",
      },
      500
    );
  }

  if (!tossSecretKey) {
    return jsonResponse(
      {
        success: false,
        error: "Missing TOSS_SECRET_KEY",
      },
      500
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(
      {
        success: false,
        error: "Missing Authorization header",
      },
      401
    );
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let orderIdForLogging = "unknown";
  let paymentIdForLogging: string | null = null;

  try {
    const {
      data: { user },
      error: userError,
    } = await supabaseUserClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        {
          success: false,
          error: "Unauthorized",
          detail: userError?.message ?? null,
        },
        401
      );
    }

    // 관리자 여부 확인
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return jsonResponse(
        {
          success: false,
          error: "Admin access required",
        },
        403
      );
    }

    const requestBody = await req.json().catch(() => null);
    const orderId = requestBody?.orderId;
    const cancelReason = requestBody?.cancelReason;

    if (typeof orderId === "string") {
      orderIdForLogging = orderId;
    }

    await logPaymentEvent({
      supabaseAdmin,
      orderId: orderIdForLogging,
      eventType: "refund_manual_cancel_requested",
      source: "cancel_payment",
      payload: {
        requestBody,
        requesterUserId: user.id,
      },
    });

    if (!orderId || typeof orderId !== "string") {
      return jsonResponse(
        {
          success: false,
          error: "orderId is required",
        },
        400
      );
    }

    const normalizedCancelReason =
      typeof cancelReason === "string" && cancelReason.trim().length > 0
        ? cancelReason.trim()
        : "관리자 수동 환불 실행";

    // 1) payment 조회
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle<PaymentRow>();

    if (paymentError) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "refund_manual_cancel_payment_lookup_failed",
        source: "cancel_payment",
        payload: { error: paymentError.message },
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
        eventType: "refund_manual_cancel_payment_not_found",
        source: "cancel_payment",
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

    if (payment.status === "refunded") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_already_refunded",
        source: "cancel_payment",
        payload: { paymentStatus: payment.status },
      });

      return jsonResponse({
        success: true,
        message: "Payment already refunded",
        data: {
          alreadyRefunded: true,
          orderId,
          paymentId: payment.id,
        },
      });
    }

    if (payment.status !== "paid") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_invalid_payment_status",
        source: "cancel_payment",
        payload: { paymentStatus: payment.status },
      });

      return jsonResponse(
        {
          success: false,
          error: "Only paid payments can be cancelled",
          detail: { paymentStatus: payment.status },
        },
        400
      );
    }

    if (!payment.pg_tid) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_missing_pg_tid",
        source: "cancel_payment",
      });

      return jsonResponse(
        {
          success: false,
          error: "pg_tid(paymentKey) is missing",
        },
        500
      );
    }

    // 2) 환불 요청 조회 - approved 상태여야 실제 환불 가능
    const { data: refundRequest, error: refundRequestError } = await supabaseAdmin
      .from("refund_requests")
      .select("id, payment_id, order_id, user_id, cancel_reason, request_status, admin_note, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RefundRequestRow>();

    if (refundRequestError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_refund_request_lookup_failed",
        source: "cancel_payment",
        payload: { error: refundRequestError.message },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to fetch refund request",
          detail: refundRequestError.message,
        },
        500
      );
    }

    if (!refundRequest) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_refund_request_not_found",
        source: "cancel_payment",
      });

      return jsonResponse(
        {
          success: false,
          error: "Refund request not found",
        },
        404
      );
    }

    if (refundRequest.request_status === "completed") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_already_completed",
        source: "cancel_payment",
        payload: {
          refundRequestId: refundRequest.id,
          requestStatus: refundRequest.request_status,
        },
      });

      return jsonResponse({
        success: true,
        message: "Refund already completed",
        data: {
          alreadyCompleted: true,
          refundRequestId: refundRequest.id,
        },
      });
    }

    if (refundRequest.request_status !== "approved") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_invalid_refund_status",
        source: "cancel_payment",
        payload: {
          refundRequestId: refundRequest.id,
          requestStatus: refundRequest.request_status,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Only approved refund requests can be executed",
          detail: { requestStatus: refundRequest.request_status },
        },
        400
      );
    }

    // 3) Toss cancel 시작
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "refund_manual_cancel_started",
      source: "cancel_payment",
      payload: {
        refundRequestId: refundRequest.id,
        paymentKey: payment.pg_tid,
        requesterUserId: user.id,
      },
    });

    const cancelResult = await cancelTossPayment({
      secretKey: tossSecretKey,
      paymentKey: payment.pg_tid,
      cancelReason: normalizedCancelReason,
      idempotencyKey: `manual-refund-${payment.id}-${refundRequest.id}`,
    });

    if (!cancelResult.ok) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_failed",
        source: "cancel_payment",
        payload: {
          refundRequestId: refundRequest.id,
          status: cancelResult.status,
          response: cancelResult.data,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss refund failed",
          detail: cancelResult.data,
        },
        502
      );
    }

    // 4) DB 반영
    const { error: paymentUpdateError } = await supabaseAdmin
      .from("payments")
      .update({
        status: "refunded",
      })
      .eq("id", payment.id);

    if (paymentUpdateError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_payment_update_failed",
        source: "cancel_payment",
        payload: {
          refundRequestId: refundRequest.id,
          error: paymentUpdateError.message,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss refund succeeded but payment update failed",
          detail: paymentUpdateError.message,
        },
        500
      );
    }

    const nextAdminNote = [
      refundRequest.admin_note ?? "",
      "MANUAL_REFUND_COMPLETED",
      `ADMIN_USER:${user.id}`,
    ]
      .filter(Boolean)
      .join(" / ");

    const { error: refundRequestUpdateError } = await supabaseAdmin
      .from("refund_requests")
      .update({
        request_status: "completed",
        admin_note: nextAdminNote,
      })
      .eq("id", refundRequest.id);

    if (refundRequestUpdateError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_manual_cancel_refund_request_update_failed",
        source: "cancel_payment",
        payload: {
          refundRequestId: refundRequest.id,
          error: refundRequestUpdateError.message,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Toss refund succeeded but refund request update failed",
          detail: refundRequestUpdateError.message,
        },
        500
      );
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "refund_manual_cancel_success",
      source: "cancel_payment",
      payload: {
        refundRequestId: refundRequest.id,
        status: cancelResult.status,
        response: cancelResult.data,
        requesterUserId: user.id,
      },
    });

    return jsonResponse({
      success: true,
      message: "환불이 성공적으로 완료되었습니다.",
      data: {
        orderId,
        paymentId: payment.id,
        refundRequestId: refundRequest.id,
        tossCancel: cancelResult.data,
      },
    });
  } catch (error) {
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: paymentIdForLogging,
      orderId: orderIdForLogging,
      eventType: "refund_manual_cancel_unexpected_error",
      source: "cancel_payment",
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