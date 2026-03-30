import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { paymentKey, orderId, amount } = await req.json();

    // 🔑 토스 secret key
    const secretKey = "test_sk_6bJXmgo28e4yeojkXQAArLAnGKWx";

    // 1. 토스 결제 승인 요청
    const response = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(secretKey + ":"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      }
    );

    const result = await response.json();

    if (result.status !== "DONE") {
      return new Response(JSON.stringify({ error: "결제 승인 실패", result }), {
        status: 400,
      });
    }

    // 2. Supabase 연결
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. 기존 payment 확인
    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", orderId)
      .single();

    if (!payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404,
      });
    }

    // 4. 크레딧 지급
    await supabase.rpc("process_successful_payment", {
      p_order_id: orderId,
      p_pg_tid: paymentKey,
    });

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
});