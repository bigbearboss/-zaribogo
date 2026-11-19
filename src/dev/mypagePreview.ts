import type { CreditProduct } from '../services/paymentService';

/** Fictional UI fixtures, dynamically imported only by Vite's DEV branch. */
export const previewUser = { id: 'layout-preview-only', email: 'very.long.layout.preview.account@example.invalid' };
export const previewProfile = { ...previewUser, full_name: '화면 검토', plan_type: 'free' };
export const previewCredits = { total_credits: 30, used_credits: 7 };
export const previewProducts: CreditProduct[] = [
  { id: 'preview-starter', name: 'Starter Pack', price: 32450, base_credits: 10, bonus_credits: 0, total_credits: 10, is_b2b_only: false, badge_text: null, is_active: true, original_price: 64900, promo_label: '50% 할인 예시', promo_active: true },
  { id: 'preview-growth', name: 'Growth Pack', price: 49900, base_credits: 20, bonus_credits: 0, total_credits: 20, is_b2b_only: false, badge_text: null, is_active: true, original_price: 99800, promo_label: '50% 할인 예시', promo_active: true },
  { id: 'preview-team', name: 'Pro / B2B', price: 0, base_credits: 0, bonus_credits: 0, total_credits: 0, is_b2b_only: true, badge_text: null, is_active: true },
];
export const previewReports = [
  {
    id: 'preview-report', title: '[화면 예시] 해오름마을 근린상가 카페 후보지 비교 리포트',
    location: '경기도 파주시 해오름로 예시 상가 1층 (실제 분석 아님)', business_type: '카페', created_at: '2026-11-19T02:00:00Z',
    result_data: {
      score: { total: 48, grade: 'B', risk_level: 'medium' },
      breakdown: { market_demand: 45, competition: 60, financial_pressure: 40, structural_stability: 45 },
      summary: {
        one_line: '화면 검토용 예시입니다. 실제 입지 판단에 사용할 수 없습니다.',
        strengths: ['생활권 내 반복 방문 수요를 확인하세요.', '주거지와 상가 사이의 보행 동선을 확인하세요.'],
        risk: ['주변 동일 업종의 운영 시간과 가격대를 비교하세요.'],
        precautions: '평일과 주말의 현장 방문으로 고객 동선과 비용 조건을 확인하는 예시입니다.',
        recommendations: ['고정비와 예상 매출을 비교하고 임대 조건을 확인하세요.'],
        field_checklist: ['평일 점심과 퇴근 시간 유동 확인', '주말 방문객과 주차 접근성 확인'],
        realtor_checklist: ['관리비 포함 항목과 계약 갱신 조건 확인', '권리금의 산정 근거와 시설 상태 확인'],
        decision_rationale: ['네 가지 분석 축의 설명과 긴 문장의 줄바꿈을 점검하는 예시입니다.'],
        strategic_advice: ['실제 투자 판단이 아닌 UI 검토용 텍스트입니다.'],
      },
      financial_pressure_detail: {
        monthlyRent: 2500000, deposit: 50000000, premium: 20000000, estimatedMonthlyFixedCost: 8000000,
        financialPressureScore: 40, rentBurdenRatio: 0.14, rentBurdenLevel: 'adequate',
        depositLiquidityMonths: 6, depositLiquidityLevel: 'caution', premiumPaybackMonths: 20,
        premiumPaybackLevel: 'adequate', targetMonthlyRevenue: 18000000, requiredRevenueLevel: 'caution',
      },
    },
  },
  { id: 'preview-report-2', title: '[화면 예시] 주거지 인근 베이커리 후보지', location: '경기도 파주시 예시 도로 101', business_type: '베이커리', created_at: '2026-11-18T02:00:00Z', result_data: {} },
];
export const previewPayments = ['paid', 'refund_requested', 'refunded'].map((status, index) => ({
  id: `preview-payment-${index}`, order_id: `UI-PREVIEW-ONLY-20261119-VERY-LONG-ORDER-ID-${index}`,
  product_id: 'preview-growth', amount: 49900,
  status: status as 'paid' | 'refund_requested' | 'refunded',
  paid_at: '2026-11-19T02:00:00Z', created_at: '2026-11-19T02:00:00Z',
  credit_products: { name: 'Growth Pack', total_credits: 20 },
}));

export function showPreviewNotice() {
  const banner = document.createElement('p');
  banner.textContent = '화면 검토용 가상 데이터 · 결제·환불·탈퇴는 실행되지 않습니다.';
  banner.setAttribute('role', 'note');
  banner.style.cssText = 'padding:12px 16px;border:1px dashed #94a3b8;border-radius:12px;color:var(--text-muted);font-size:13px;';
  document.querySelector('.mypage-main')?.prepend(banner);
}
