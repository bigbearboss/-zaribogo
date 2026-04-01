-- ============================================================
-- profiles에 is_admin 컬럼 추가
-- ============================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 인덱스 (관리자 수는 적지만 조회 빈도를 위해)
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
    ON public.profiles(is_admin)
    WHERE is_admin = true;


-- ============================================================
-- 관리자용 RLS 정책
-- ============================================================

-- ── profiles: 관리자는 모든 프로필 조회 가능 ──
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles AS p
            WHERE p.id = auth.uid() AND p.is_admin = true
        )
    );

-- ── payments: 관리자는 모든 결제 내역 조회 가능 ──
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can view all payments"
    ON public.payments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles AS p
            WHERE p.id = auth.uid() AND p.is_admin = true
        )
    );

-- ── refund_requests: 테이블이 있을 때 관리자 전체 조회 허용 ──
-- (테이블이 없으면 이 SQL은 건너뜁니다. 배포 후 필요 시 추가하세요.)
--
-- DROP POLICY IF EXISTS "Admins can view all refund_requests" ON public.refund_requests;
-- CREATE POLICY "Admins can view all refund_requests"
--     ON public.refund_requests FOR SELECT
--     USING (
--         EXISTS (
--             SELECT 1 FROM public.profiles AS p
--             WHERE p.id = auth.uid() AND p.is_admin = true
--         )
--     );


-- ============================================================
-- 첫 번째 관리자 지정 방법 (운영자 콘솔 또는 SQL Editor에서 실행)
-- ============================================================
--
-- UPDATE public.profiles
-- SET is_admin = true
-- WHERE email = 'your-admin-email@example.com';
