import { supabase } from "./supabase";

export type CreditProduct = {
  id: string;
  name: string;
  price: number;
  base_credits: number;
  bonus_credits: number;
  total_credits: number;
  is_b2b_only: boolean;
  badge_text: string | null;
  is_active: boolean;
};

export type PaymentInitResult = {
  payment_id: string;
  order_id: string;
  amount: number;
  status: string;
  product_id: string;
  product_name: string;
  total_credits: number;
  badge_text: string | null;
  user_email: string | null;
  created_at: string;
};

export async function fetchActiveCreditProducts(): Promise<CreditProduct[]> {
  const { data, error } = await supabase
    .from("credit_products")
    .select("*")
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (error) {
    throw new Error(`상품 목록을 불러오지 못했습니다. (${error.message})`);
  }

  return (data ?? []) as CreditProduct[];
}

export async function initiatePaymentFlow(productId: string): Promise<PaymentInitResult> {
  const { data, error } = await supabase.functions.invoke("create-payment", {
    body: {
      product_id: productId,
    },
  });

    if (error) {
    console.error("[paymentService] invoke error =", error);
    console.error("[paymentService] invoke data =", data);
    throw new Error(
      `결제 준비 요청 실패: ${error.message}${
        data?.error ? ` / ${data.error}` : ""
      }${data?.detail ? ` / ${data.detail}` : ""}`
    );
  }

  if (!data?.success) {
    throw new Error(
      `${data?.error || "결제 준비 중 오류가 발생했습니다."}${
        data?.detail ? ` / ${data.detail}` : ""
      }`
    );
  }
  
  return data.data as PaymentInitResult;
}
