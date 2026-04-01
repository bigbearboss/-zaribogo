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
  user_id: string;
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

    const requestBody = await req.json().catch(() => null);
    const orderId = requestBody?.orderId;
    const cancelReason = requestBody?.cancelReason;

    if (typeof orderId === "string") {
      orderIdForLogging = orderId;
    }

    await logPaymentEvent({
      supabaseAdmin,
      orderId: orderIdForLogging,
      eventType: "refund_review_requested",
      source: "request_refund_review",
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

    if (!cancelReason || typeof cancelReason !== "string" || cancelReason.trim().length < 2) {
      return jsonResponse(
        {
          success: false,
          error: "cancelReason is required",
        },
        400
      );
    }

    const normalizedCancelReason = cancelReason.trim();

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle<PaymentRow>();

    if (paymentError) {
      await logPaymentEvent({
        supabaseAdmin,
        orderId,
        eventType: "refund_review_payment_lookup_failed",
        source: "request_refund_review",
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
        eventType: "refund_review_payment_not_found",
        source: "request_refund_review",
        payload: { requesterUserId: user.id },
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

    if (payment.user_id !== user.id) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_forbidden",
        source: "request_refund_review",
        payload: {
          paymentUserId: payment.user_id,
          requesterUserId: user.id,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "You do not have permission to request a refund for this payment",
        },
        403
      );
    }

    if (payment.status !== "paid") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_invalid_payment_status",
        source: "request_refund_review",
        payload: { paymentStatus: payment.status },
      });

      return jsonResponse(
        {
          success: false,
          error: "Only paid payments can be reviewed for refund",
          detail: { paymentStatus: payment.status },
        },
        400
      );
    }

    const { data: existingRefund, error: existingRefundError } = await supabaseAdmin
      .from("refund_requests")
      .select("id, request_status, created_at")
      .eq("payment_id", payment.id)
      .in("request_status", ["requested", "approved", "completed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRefundError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_existing_lookup_failed",
        source: "request_refund_review",
        payload: { error: existingRefundError.message },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to check existing refund requests",
          detail: existingRefundError.message,
        },
        500
      );
    }

    if (existingRefund) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_duplicate_request_blocked",
        source: "request_refund_review",
        payload: existingRefund,
      });

      return jsonResponse(
        {
          success: false,
          error: "A refund request already exists for this payment",
          detail: existingRefund,
        },
        409
      );
    }

    const paymentReferenceTime = payment.paid_at ?? payment.created_at;

    const { count: analysisCountAfterPayment, error: analysisCountError } = await supabaseAdmin
      .from("analysis_results")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", paymentReferenceTime);

    if (analysisCountError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_analysis_lookup_failed",
        source: "request_refund_review",
        payload: {
          error: analysisCountError.message,
          paymentReferenceTime,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to check analysis usage after payment",
          detail: analysisCountError.message,
        },
        500
      );
    }

    const autoRefundEligible = (analysisCountAfterPayment ?? 0) === 0;
    const requestStatus = autoRefundEligible ? "approved" : "requested";
    const adminNote = autoRefundEligible
      ? "AUTO_ELIGIBLE: 결제 이후 분석 결과가 없어 자동 환불 가능"
      : `MANUAL_REVIEW_REQUIRED: 결제 이후 분석 결과 ${analysisCountAfterPayment}건 존재`;

    const { data: refundRequest, error: refundInsertError } = await supabaseAdmin
      .from("refund_requests")
      .insert({
        payment_id: payment.id,
        order_id: payment.order_id,
        user_id: user.id,
        request_status: requestStatus,
        refund_type: "full",
        refund_amount: payment.amount,
        cancel_reason: normalizedCancelReason,
        admin_note: adminNote,
      })
      .select("*")
      .single();

    if (refundInsertError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_insert_failed",
        source: "request_refund_review",
        payload: { error: refundInsertError.message },
      });

      return jsonResponse(
        {
          success: false,
          error: "Failed to create refund request",
          detail: refundInsertError.message,
        },
        500
      );
    }

    if (!autoRefundEligible) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_manual_review_required",
        source: "request_refund_review",
        payload: {
          refundRequestId: refundRequest.id,
          analysisCountAfterPayment,
          requestStatus,
        },
      });

      return jsonResponse({
        success: true,
        message: "Refund request created and marked for manual review",
        data: {
          refundRequest,
          autoRefundEligible,
          autoRefundCompleted: false,
          analysisCountAfterPayment,
        },
      });
    }

    if (!payment.pg_tid) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_auto_cancel_missing_pg_tid",
        source: "request_refund_review",
        payload: {
          refundRequestId: refundRequest.id,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "pg_tid(paymentKey) is missing",
        },
        500
      );
    }

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: "refund_auto_cancel_started",
      source: "request_refund_review",
      payload: {
        refundRequestId: refundRequest.id,
        paymentKey: payment.pg_tid,
      },
    });

    const cancelResult = await cancelTossPayment({
      secretKey: tossSecretKey,
      paymentKey: payment.pg_tid,
      cancelReason: normalizedCancelReason,
      idempotencyKey: `refund-${payment.id}-${refundRequest.id}`,
    });

    if (!cancelResult.ok) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_auto_cancel_failed",
        source: "request_refund_review",
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
        eventType: "refund_auto_cancel_payment_update_failed",
        source: "request_refund_review",
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

    const { error: refundRequestUpdateError } = await supabaseAdmin
      .from("refund_requests")
      .update({
        request_status: "completed",
        admin_note: `${adminNote} / AUTO_REFUND_COMPLETED`,
      })
      .eq("id", refundRequest.id);

    if (refundRequestUpdateError) {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_auto_cancel_refund_request_update_failed",
        source: "request_refund_review",
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
      eventType: "refund_auto_cancel_success",
      source: "request_refund_review",
      payload: {
        refundRequestId: refundRequest.id,
        status: cancelResult.status,
        response: cancelResult.data,
      },
    });

    return jsonResponse({
      success: true,
      message: "자동 환불 완료",
      data: {
        refundRequest,
        autoRefundEligible: true,
        autoRefundCompleted: true,
        analysisCountAfterPayment,
        tossCancel: cancelResult.data,
      },
    });
  } catch (error) {
    await logPaymentEvent({
      supabaseAdmin,
      paymentId: paymentIdForLogging,
      orderId: orderIdForLogging,
      eventType: "refund_review_unexpected_error",
      source: "request_refund_review",
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
