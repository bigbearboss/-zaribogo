-- 1. Add promotion columns to credit_products
ALTER TABLE public.credit_products 
  ADD COLUMN IF NOT EXISTS original_price integer,
  ADD COLUMN IF NOT EXISTS promo_label text,
  ADD COLUMN IF NOT EXISTS promo_active boolean DEFAULT false;

-- 2. Update Starter Pack price and promotion details
UPDATE public.credit_products
SET 
  original_price = 64900,
  price = 32450,
  promo_label = '초기 유저 50% 할인',
  promo_active = true
WHERE name = 'Starter Pack';

-- 3. Update Growth Pack price and promotion details
UPDATE public.credit_products
SET 
  original_price = 99800,
  price = 49900,
  promo_label = '초기 유저 50% 할인',
  promo_active = true
WHERE name = 'Growth Pack';
