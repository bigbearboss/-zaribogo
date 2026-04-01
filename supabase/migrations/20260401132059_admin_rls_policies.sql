-- ============================================================
-- 관리자용 RLS SELECT 정책 추가
-- 대상: profiles, payments, refund_requests, payment_events
--
-- 전제 조건:
--   - profiles.is_admin 컬럼이 존재해야 합니다.
--     (20260401131316_add_admin_flag.sql 선행 실행 필요)
--   - refund_requests / payment_events 는 테이블이 없으면
--     해당 블록을 주석 해제 후 테이블 생성 뒤 실행하세요.
--
-- 기존 정책과 충돌하지 않도록 DROP IF EXISTS 를 모두 선행합니다.
-- ============================================================


-- ── 관리자 판별 헬퍼 함수 ─────────────────────────────────────
-- 반복되는 서브쿼리 대신 함수로 분리해 정책 가독성 향상
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_admin = true
    );
$$;

-- authenticated 유저만 호출 가능 (anon 차단)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ============================================================
-- 1. profiles
--    기존: "Users can view own profile"   (auth.uid() = id)
--    기존: "Users can update own profile"
--    추가: "Admins can view all profiles" — 관리자 전체 조회
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (public.is_admin());


-- ============================================================
-- 2. payments
--    기존: "Users can view their own payments."  (auth.uid() = user_id)
--    추가: "Admins can view all payments"        — 관리자 전체 조회
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can view all payments"
    ON public.payments
    FOR SELECT
    USING (public.is_admin());


-- ============================================================
-- 3. refund_requests
--    (테이블이 아직 없으면 아래 블록 전체를 주석 처리하세요)
--
--    일반 사용자: 자신의 환불 요청만 조회
--    관리자      : 전체 조회
-- ============================================================

-- 테이블 RLS 활성화 (이미 켜져 있으면 무시됨)
ALTER TABLE IF EXISTS public.refund_requests ENABLE ROW LEVEL SECURITY;

-- 일반 사용자 정책 (테이블 생성 시 아직 없을 수 있으므로 DROP 후 재생성)
DROP POLICY IF EXISTS "Users can view their own refund_requests" ON public.refund_requests;
CREATE POLICY "Users can view their own refund_requests"
    ON public.refund_requests
    FOR SELECT
    USING (auth.uid() = user_id);

-- 관리자 정책
DROP POLICY IF EXISTS "Admins can view all refund_requests" ON public.refund_requests;
CREATE POLICY "Admins can view all refund_requests"
    ON public.refund_requests
    FOR SELECT
    USING (public.is_admin());


-- ============================================================
-- 4. payment_events
--    (테이블이 아직 없으면 아래 블록 전체를 주석 처리하세요)
--
--    일반 사용자: 자신의 payment에 연결된 이벤트만 조회
--    관리자      : 전체 조회
-- ============================================================

-- 테이블 RLS 활성화
ALTER TABLE IF EXISTS public.payment_events ENABLE ROW LEVEL SECURITY;

-- 일반 사용자 정책: payments.user_id 를 통해 자기 이벤트만 허용
DROP POLICY IF EXISTS "Users can view their own payment_events" ON public.payment_events;
CREATE POLICY "Users can view their own payment_events"
    ON public.payment_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.payments
            WHERE payments.id = payment_events.payment_id
              AND payments.user_id = auth.uid()
        )
    );

-- 관리자 정책
DROP POLICY IF EXISTS "Admins can view all payment_events" ON public.payment_events;
CREATE POLICY "Admins can view all payment_events"
    ON public.payment_events
    FOR SELECT
    USING (public.is_admin());
