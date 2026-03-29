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

function createOrderId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  return `order_${yy}${mm}${dd}${hh}${min}${ss}_${randomHex}`;
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(
        {
          success: false,
          error: "Missing Supabase environment variables",
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

    const requestBody = await req.json().catch(() => null);
    const productId = requestBody?.product_id;

    if (!productId || typeof productId !== "string") {
      return jsonResponse(
        {
          success: false,
          error: "product_id is required",
        },
        400
      );
    }

    // 사용자 인증용 클라이언트
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

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

    // DB 조작용 관리자 클라이언트
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: product, error: productError } = await supabaseAdmin
      .from("credit_products")
      .select("id, name, price, total_credits, is_active, is_b2b_only, badge_text")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return jsonResponse(
        {
          success: false,
          error: "Product not found",
          detail: productError?.message ?? null,
        },
        404
      );
    }

    if (!product.is_active) {
      return jsonResponse(
        {
          success: false,
          error: "This product is not active",
        },
        400
      );
    }

    if (product.is_b2b_only) {
      return jsonResponse(
        {
          success: false,
          error: "This product is B2B only and cannot be purchased online",
        },
        400
      );
    }

    const orderId = createOrderId();

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: user.id,
        product_id: product.id,
        order_id: orderId,
        amount: product.price,
        status: "pending",
        pg_provider: null,
      })
      .select("id, order_id, amount, status, created_at")
      .single();

    if (paymentError || !payment) {
      return jsonResponse(
        {
          success: false,
          error: "Failed to create pending payment",
          detail: paymentError?.message ?? null,
        },
        500
      );
    }

    return jsonResponse({
      success: true,
      data: {
        payment_id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount,
        status: payment.status,
        product_id: product.id,
        product_name: product.name,
        total_credits: product.total_credits,
        badge_text: product.badge_text,
        user_email: user.email,
        created_at: payment.created_at,
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