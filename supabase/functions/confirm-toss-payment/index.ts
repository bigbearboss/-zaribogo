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

  try {
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

    const requestBody = await req.json().catch(() => null);
    const paymentKey = requestBody?.paymentKey;
    const orderId = requestBody?.orderId;
    const amount = requestBody?.amount;

    if (!paymentKey || typeof paymentKey !== "string") {
      return jsonResponse(
        {
          success: false,
          error: "paymentKey is required",
        },
        400
      );
    }

    if (!orderId || typeof orderId !== "string") {
      return jsonResponse(
        {
          success: false,
          error: "orderId is required",
        },
        400
      );
    }

    if (typeof amount !== "number" || Number.isNaN(amount)) {
      return jsonResponse(
        {
          success: false,
          error: "amount must be a valid number",
        },
        400
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // DB에서 payment 확인
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (paymentError) {
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
      return jsonResponse(
        {
          success: false,
          error: "Payment not found",
        },
        404
      );
    }

    if (payment.amount !== amount) {
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

    // 이미 paid면 재승인 없이 그대로 성공 처리
    if (payment.status === "paid") {
      return jsonResponse({
        success: true,
        message: "Payment already processed",
        data: {
          orderId,
          payment,
        },
      });
    }

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
      return jsonResponse(
        {
          success: false,
          error: "Toss confirm failed",
          detail: tossResult,
        },
        400
      );
    }

    if (tossResult.orderId !== orderId) {
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
      return jsonResponse(
        {
          success: false,
          error: "Toss payment is not completed",
          detail: tossResult.status,
        },
        400
      );
    }

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
      return jsonResponse(
        {
          success: false,
          error: "RPC Error",
          detail: rpcError.message,
        },
        500
      );
    }

    const { data: paymentAfter, error: paymentAfterError } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, product_id, order_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (paymentAfterError) {
      return jsonResponse(
        {
          success: false,
          error: "Failed to fetch payment after processing",
          detail: paymentAfterError.message,
        },
        500
      );
    }

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
