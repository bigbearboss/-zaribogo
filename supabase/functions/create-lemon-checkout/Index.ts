import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LEMON_API_KEY = Deno.env.get("LEMON_SQUEEZY_API_KEY")!;
const LEMON_STORE_ID = Deno.env.get("LEMON_SQUEEZY_STORE_ID")!;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const productId = String(body.productId ?? "").trim();

    if (!productId) {
      return json({ error: "productId is required" }, 400);
    }

    const { data: product, error: productError } = await supabase
      .from("credit_products")
      .select("id, name, total_credits, provider, provider_variant_id, is_active")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return json({ error: "Product not found" }, 404);
    }

    if (!product.is_active) {
      return json({ error: "Inactive product" }, 400);
    }

    if (product.provider !== "lemonsqueezy" || !product.provider_variant_id) {
      return json({ error: "Lemon variant is not configured for this product" }, 400);
    }

    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: {
            embed: false,
            media: true,
            logo: true,
            desc: true,
            discount: false,
            button_color: "#7047EB",
            button_text_color: "#FFFFFF",
          },
          product_options: {
            enabled_variants: [Number(product.provider_variant_id)],
            redirect_url: `${new URL(req.url).origin}/mypage?section=payments&lemon=success`,
            receipt_button_text: "자리보고 열기",
            receipt_link_url: `${new URL(req.url).origin}/mypage?section=payments`,
            receipt_thank_you_note: "결제 완료 후 분석 크레딧이 자동 지급됩니다.",
          },
          checkout_data: {
            email: user.email ?? "",
            custom: {
              user_id: user.id,
              product_id: product.id,
              credits: product.total_credits,
              provider: "lemonsqueezy",
            },
          },
          test_mode: true,
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: String(LEMON_STORE_ID),
            },
          },
          variant: {
            data: {
              type: "variants",
              id: String(product.provider_variant_id),
            },
          },
        },
      },
    };

    const lemonRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${LEMON_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const lemonData = await lemonRes.json();

    if (!lemonRes.ok) {
      console.error("[create-lemon-checkout] lemon error", lemonData);
      return json({ error: "Failed to create Lemon checkout", details: lemonData }, 500);
    }

    const checkoutUrl = lemonData?.data?.attributes?.url;
    if (!checkoutUrl) {
      return json({ error: "Checkout URL missing" }, 500);
    }

    return json({
      success: true,
      checkoutUrl,
      variantId: product.provider_variant_id,
      productName: product.name,
    });
  } catch (error) {
    console.error("[create-lemon-checkout] unexpected error", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});