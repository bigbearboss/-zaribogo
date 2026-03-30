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

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        error: "Missing required environment variables",
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

    // 1) 결제 조회
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
        eventType: "refund_review_payment_not_found",
        source: "request_refund_review",
        payload: {
          requesterUserId: user.id,
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

    // 2) 본인 주문인지 확인
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

    // 3) paid 상태만 환불 검토 가능
    if (payment.status !== "paid") {
      await logPaymentEvent({
        supabaseAdmin,
        paymentId: payment.id,
        orderId,
        eventType: "refund_review_invalid_payment_status",
        source: "request_refund_review",
        payload: {
          paymentStatus: payment.status,
        },
      });

      return jsonResponse(
        {
          success: false,
          error: "Only paid payments can be reviewed for refund",
          detail: {
            paymentStatus: payment.status,
          },
        },
        400
      );
    }

    // 4) 기존 환불 요청 중복 체크
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
        payload: {
          error: existingRefundError.message,
        },
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

    // 5) 결제 이후 분석 사용 여부 확인 (보수적 자동 환불 기준)
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

    // 6) 환불 요청 생성
    const { data: refundRequest, error: refundInsertError } = await supabaseAdmin
      .from("refund_requests")
      .insert({
        payment_id: payment.id,
        order_id: payment.order_id,
        user_id: user.id,
        request_status: requestStatus,
        refund_type: "full",
        refund_amount: payment.amount,
        cancel_reason: cancelReason.trim(),
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
        payload: {
          error: refundInsertError.message,
        },
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

    await logPaymentEvent({
      supabaseAdmin,
      paymentId: payment.id,
      orderId,
      eventType: autoRefundEligible
        ? "refund_review_auto_approved"
        : "refund_review_manual_review_required",
      source: "request_refund_review",
      payload: {
        refundRequestId: refundRequest.id,
        analysisCountAfterPayment,
        requestStatus,
      },
    });

    return jsonResponse({
      success: true,
      message: autoRefundEligible
        ? "Refund request created and marked as auto-eligible"
        : "Refund request created and marked for manual review",
      data: {
        refundRequest,
        autoRefundEligible,
        analysisCountAfterPayment,
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