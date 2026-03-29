-- Trigger Function for updated_at
CREATE OR REPLACE FUNCTION public.update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Create credit_products table
CREATE TABLE IF NOT EXISTS public.credit_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  price integer NOT NULL CHECK (price >= 0),
  base_credits integer NOT NULL DEFAULT 0 CHECK (base_credits >= 0),
  bonus_credits integer NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  total_credits integer NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
  is_b2b_only boolean NOT NULL DEFAULT false,
  badge_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_total_credits CHECK (total_credits = base_credits + bonus_credits)
);

CREATE INDEX IF NOT EXISTS idx_credit_products_active ON public.credit_products(is_active);

-- updated_at trigger for credit_products
DROP TRIGGER IF EXISTS update_credit_products_modtime ON public.credit_products;
CREATE TRIGGER update_credit_products_modtime
BEFORE UPDATE ON public.credit_products
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- Setup RLS for credit_products
ALTER TABLE public.credit_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Credit products are viewable by everyone." ON public.credit_products;
CREATE POLICY "Credit products are viewable by everyone." ON public.credit_products
  FOR SELECT USING (true);


-- 2. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  product_id uuid NOT NULL REFERENCES public.credit_products(id),
  order_id text NOT NULL UNIQUE,
  amount integer NOT NULL CHECK (amount >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  pg_provider text,
  pg_tid text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- updated_at trigger for payments
DROP TRIGGER IF EXISTS update_payments_modtime ON public.payments;
CREATE TRIGGER update_payments_modtime
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

-- Setup RLS for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own payments." ON public.payments;
CREATE POLICY "Users can view their own payments." ON public.payments
  FOR SELECT USING (auth.uid() = user_id);
-- client cannot process updates/inserts based on these policies (implicitly restricted)


-- 3. Create credit_transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount integer NOT NULL CHECK (amount <> 0),
  type text NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'admin_grant')),
  payment_id uuid REFERENCES public.payments(id),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_id ON public.credit_transactions(payment_id);

-- Setup RLS for credit_transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own credit transactions." ON public.credit_transactions;
CREATE POLICY "Users can view their own credit transactions." ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);


-- 4. Create process_successful_payment RPC function
CREATE OR REPLACE FUNCTION public.process_successful_payment(
  p_order_id text,
  p_pg_tid text,
  p_paid_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_product record;
BEGIN
  -- 1. Lock the payment record
  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found for order_id: %', p_order_id;
  END IF;

  -- Idempotency check
  IF v_payment.status = 'paid' THEN
    RETURN true;
  END IF;

  -- Validate payment status
  IF v_payment.status != 'pending' THEN
    RAISE EXCEPTION 'Payment cannot be processed. Current status is %', v_payment.status;
  END IF;

  -- 2. Get and validate product details
  SELECT * INTO v_product
  FROM public.credit_products
  WHERE id = v_payment.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found for payment';
  END IF;

  IF v_product.is_active = false THEN
    RAISE EXCEPTION 'Product is not active';
  END IF;

  IF v_product.is_b2b_only = true THEN
    RAISE EXCEPTION 'Product is B2B only and cannot be processed via this standard automated flow';
  END IF;

  IF v_payment.amount != v_product.price THEN
    RAISE EXCEPTION 'Payment amount mismatch: Expected %, got %', v_product.price, v_payment.amount;
  END IF;

  -- 3. Update payment status
  UPDATE public.payments
  SET status = 'paid',
      pg_tid = p_pg_tid,
      paid_at = p_paid_at,
      updated_at = now()
  WHERE order_id = p_order_id;

  -- 4. Insert credit transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, payment_id, description)
  VALUES (
    v_payment.user_id, 
    v_product.total_credits, 
    'purchase', 
    v_payment.id, 
    v_product.name || ' 구매 완료'
  );

  -- 5. Upsert usage_credits
  INSERT INTO public.usage_credits (user_id, total_credits, used_credits, updated_at)
  VALUES (v_payment.user_id, v_product.total_credits, 0, now())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    total_credits = public.usage_credits.total_credits + v_product.total_credits,
    updated_at = now();

  RETURN true;
END;
$$;

-- 5. RPC Grants
-- Security Note: This function processes payment success logic and credits allocation.
-- It should NOT be callable directly by a normal authenticated user (client-side) to prevent abuse.
-- It is granted execution to 'service_role' (e.g., webhook server) only.
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(text, text, timestamptz) FROM public;
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_successful_payment(text, text, timestamptz) TO service_role;


-- 6. Seed initial credit_products data
-- (Note: Prices provided below are MVP temporary prices)
INSERT INTO public.credit_products (name, price, base_credits, bonus_credits, total_credits, is_b2b_only, badge_text, is_active)
VALUES
  ('Free', 0, 2, 0, 2, false, null, false),
  ('Starter Pack', 99000, 8, 2, 10, false, '오픈 기념 보너스 크레딧 제공', true),
  ('Growth Pack', 170000, 15, 5, 20, false, '오픈 기념 보너스 크레딧 제공', true),
  ('Pro / B2B', 0, 0, 0, 0, true, '별도 문의', true)
ON CONFLICT (name) DO NOTHING;
