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
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  console.log("[paymentService] session exists =", !!session);
  console.log("[paymentService] access token exists =", !!session?.access_token);

  if (sessionError) {
    throw new Error(`세션 확인 실패: ${sessionError.message}`);
  }

  if (!session?.access_token) {
    throw new Error("로그인 세션이 없어 결제를 시작할 수 없습니다. 다시 로그인해주세요.");
  }

  // 핵심: 헤더를 직접 넣지 말고, Functions 클라이언트에 auth 토큰을 세팅
  supabase.functions.setAuth(session.access_token);

  const { data, error } = await supabase.functions.invoke("create-payment", {
    body: {
      product_id: productId,
    },
  });

  console.log("[paymentService] invoke response data =", data);
  console.log("[paymentService] invoke response error =", error);

  if (error) {
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

export async function requestTossPayment(productId: string) {
  const data = await initiatePaymentFlow(productId);

  const clientKey = "여기에 test_ck 붙여";
  const tossPayments = (window as any).TossPayments(clientKey);

  await tossPayments.requestPayment("카드", {
    amount: data.amount,
    orderId: data.order_id,
    orderName: data.product_name,
    successUrl: window.location.origin + "/success.html",
    failUrl: window.location.origin + "/fail.html",
  });
}
