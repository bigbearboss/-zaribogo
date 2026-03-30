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

function createMockPgTid() {
  const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `mock_pg_tid_${randomHex}`;
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

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          success: false,
          error: "Missing Supabase environment variables",
        },
        500
      );
    }

    const requestBody = await req.json().catch(() => null);
    const orderId = requestBody?.order_id;

    if (!orderId || typeof orderId !== "string") {
      return jsonResponse(
        {
          success: false,
          error: "order_id is required",
        },
        400
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1) 처리 전 payment 조회
    const { data: paymentBefore, error: paymentBeforeError } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, user_id, product_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (paymentBeforeError) {
      return jsonResponse(
        {
          success: false,
          error: "Failed to fetch payment before RPC",
          detail: paymentBeforeError.message,
        },
        500
      );
    }

    if (!paymentBefore) {
      return jsonResponse(
        {
          success: false,
          error: "Payment not found for given order_id",
          detail: `No payment row found for order_id=${orderId}`,
        },
        404
      );
    }

    const mockPgTid = createMockPgTid();
    const mockPaidAt = new Date().toISOString();

    // 2) RPC 호출
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      "process_successful_payment",
      {
        p_order_id: orderId,
        p_pg_tid: mockPgTid,
        p_paid_at: mockPaidAt,
      }
    );

    if (rpcError) {
      return jsonResponse(
        {
          success: false,
          error: "RPC Error",
          detail: rpcError.message,
          debug: {
            order_id: orderId,
            mock_pg_tid: mockPgTid,
            mock_paid_at: mockPaidAt,
            payment_before: paymentBefore,
          },
        },
        500
      );
    }

    // 3) 처리 후 payment 조회
    const { data: paymentAfter, error: paymentAfterError } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, user_id, product_id, amount, status, pg_tid, paid_at, created_at, updated_at")
      .eq("order_id", orderId)
      .maybeSingle();

    if (paymentAfterError) {
      return jsonResponse(
        {
          success: false,
          error: "Payment processed but failed to fetch payment after RPC",
          detail: paymentAfterError.message,
          debug: {
            order_id: orderId,
            mock_pg_tid: mockPgTid,
            mock_paid_at: mockPaidAt,
            rpc_result: rpcResult,
          },
        },
        500
      );
    }

    // 4) credit_transactions는 order_id가 아니라 payment_id로 조회해야 함
    const { data: creditTransactions, error: creditTransactionsError } = paymentAfter?.id
      ? await supabaseAdmin
          .from("credit_transactions")
          .select("id, user_id, amount, type, payment_id, description, created_at")
          .eq("payment_id", paymentAfter.id)
      : { data: null, error: null };

    // 5) usage_credits 조회
    const { data: usageCredits, error: usageCreditsError } = paymentAfter?.user_id
      ? await supabaseAdmin
          .from("usage_credits")
          .select("*")
          .eq("user_id", paymentAfter.user_id)
          .maybeSingle()
      : { data: null, error: null };

    return jsonResponse({
      success: true,
      message: "Payment simulated successfully",
      data: {
        order_id: orderId,
        mock_pg_tid: mockPgTid,
        mock_paid_at: mockPaidAt,
        rpc_result: rpcResult,
        payment_before: paymentBefore,
        payment_after: paymentAfter,
        credit_transactions: creditTransactionsError ? null : creditTransactions,
        usage_credits: usageCreditsError ? null : usageCredits,
      },
      warnings: {
        credit_transactions_query_error: creditTransactionsError?.message ?? null,
        usage_credits_query_error: usageCreditsError?.message ?? null,
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