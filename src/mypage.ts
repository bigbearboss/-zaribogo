import { supabase } from './services/supabase';
import { authService } from './services/AuthService';
import { fetchActiveCreditProducts, initiatePaymentFlow } from './services/paymentService';


// ==========================================
// 1. State Management
// ==========================================
interface AppState {
    user: any;
    profile: any;
    credits: any;
    recentReports: any[];
    allReports: any[];
    currentView: 'dashboard' | 'reports' | 'billing' | 'profile' | 'report-detail';
}

const state: AppState = {
    user: null,
    profile: null,
    credits: null,
    recentReports: [],
    allReports: [],
    currentView: 'dashboard'
};

// ==========================================
// 2. DOM Elements
// ==========================================
const DOM = {
    // Views
    views: document.querySelectorAll('.mypage-view'),
    navLinks: document.querySelectorAll('.nav-link'),

    // States
    loadingState: document.getElementById('loadingState') as HTMLElement,
    errorState: document.getElementById('errorState') as HTMLElement,
    errorMessage: document.getElementById('errorMessage') as HTMLElement,

    // Actions
    btnLogout: document.getElementById('btnLogout') as HTMLButtonElement,
        btnWithdrawOpen: document.getElementById('btnWithdrawOpen') as HTMLButtonElement,
    btnRetry: document.getElementById('btnRetry') as HTMLButtonElement,
    btnBackToMain: document.getElementById('btnBackToMain') as HTMLButtonElement,
    logoToMain: document.getElementById('logoToMain') as HTMLElement,
    btnAnalyzeNow: document.getElementById('btnAnalyzeNow') as HTMLButtonElement,
    btnStartFirst: document.getElementById('btnStartFirst') as HTMLButtonElement,
    btnViewAllReports: document.getElementById('btnViewAllReports') as HTMLButtonElement,
    btnBackToList: document.getElementById('btnBackToList') as HTMLButtonElement,

    // Dashboard widgets
    greetingMsg: document.getElementById('greetingMsg') as HTMLElement,
    creditUsed: document.getElementById('creditUsed') as HTMLElement,
    creditTotal: document.getElementById('creditTotal') as HTMLElement,
    creditUsageMeta: document.getElementById('creditUsageMeta') as HTMLElement,
    creditResetDate: document.getElementById('creditResetDate') as HTMLElement,
    creditPreviewBox: document.getElementById('creditPreviewBox') as HTMLElement,
    creditPreviewAmount: document.getElementById('creditPreviewAmount') as HTMLElement,
    recentReportsList: document.getElementById('recentReportsList') as HTMLElement,
    emptyRecentState: document.getElementById('emptyRecentState') as HTMLElement,

    // Payment
    productCards: document.getElementById('productCards') as HTMLElement,
    creditSuccessBanner: document.getElementById('creditSuccessBanner') as HTMLElement,
    btnCloseBanner: document.getElementById('btnCloseBanner') as HTMLButtonElement,

    // Billing & Refund
    paymentHistoryList: document.getElementById('paymentHistoryList') as HTMLElement,
    billingLoading: document.getElementById('billingLoading') as HTMLElement,
    billingEmptyState: document.getElementById('billingEmptyState') as HTMLElement,
    refundModal: document.getElementById('refundModal') as HTMLElement,
    btnRefundModalClose: document.getElementById('btnRefundModalClose') as HTMLButtonElement,
    btnRefundCancel: document.getElementById('btnRefundCancel') as HTMLButtonElement,
    btnRefundSubmit: document.getElementById('btnRefundSubmit') as HTMLButtonElement,
    refundProductName: document.getElementById('refundProductName') as HTMLElement,
    refundAmount: document.getElementById('refundAmount') as HTMLElement,
    refundOrderId: document.getElementById('refundOrderId') as HTMLElement,
    refundPaidAt: document.getElementById('refundPaidAt') as HTMLElement,
    refundReason: document.getElementById('refundReason') as HTMLTextAreaElement,
    refundReasonLength: document.getElementById('refundReasonLength') as HTMLElement,
    refundResultBox: document.getElementById('refundResultBox') as HTMLElement,
    refundResultIcon: document.getElementById('refundResultIcon') as HTMLElement,
    refundResultTitle: document.getElementById('refundResultTitle') as HTMLElement,
    refundResultDesc: document.getElementById('refundResultDesc') as HTMLElement,
    refundForm: document.getElementById('refundForm') as HTMLElement,
    refundModalActions: document.getElementById('refundModalActions') as HTMLElement,

    // Withdraw
    withdrawModal: document.getElementById('withdrawModal') as HTMLElement,
    btnWithdrawClose: document.getElementById('btnWithdrawClose') as HTMLButtonElement,
    btnWithdrawCancel: document.getElementById('btnWithdrawCancel') as HTMLButtonElement,
    btnWithdrawSubmit: document.getElementById('btnWithdrawSubmit') as HTMLButtonElement,
    withdrawReasonType: document.getElementById('withdrawReasonType') as HTMLSelectElement,
    withdrawReasonDetail: document.getElementById('withdrawReasonDetail') as HTMLTextAreaElement,
    withdrawReasonDetailLength: document.getElementById('withdrawReasonDetailLength') as HTMLElement,
    withdrawConfirmCheck: document.getElementById('withdrawConfirmCheck') as HTMLInputElement,
    withdrawForm: document.getElementById('withdrawForm') as HTMLElement,
    withdrawModalActions: document.getElementById('withdrawModalActions') as HTMLElement,
    withdrawResultBox: document.getElementById('withdrawResultBox') as HTMLElement,
    withdrawResultIcon: document.getElementById('withdrawResultIcon') as HTMLElement,
    withdrawResultTitle: document.getElementById('withdrawResultTitle') as HTMLElement,
    withdrawResultDesc: document.getElementById('withdrawResultDesc') as HTMLElement,
    
    // All Reports list
    allReportsList: document.getElementById('allReportsList') as HTMLElement,
    emptyAllState: document.getElementById('emptyAllState') as HTMLElement,
    searchInput: document.getElementById('searchInput') as HTMLInputElement,

    // Profile
    profileEmail: document.getElementById('profileEmail') as HTMLElement,
    profileName: document.getElementById('profileName') as HTMLElement,
    profilePlan: document.getElementById('profilePlan') as HTMLElement,

    // Detail
    detailTitle: document.getElementById('detailTitle') as HTMLElement,
    detailDate: document.getElementById('detailDate') as HTMLElement,
    detailGradeBadge: document.getElementById('detailGradeBadge') as HTMLElement,
    detailAddress: document.getElementById('detailAddress') as HTMLElement,
    detailOneLine: document.getElementById('detailOneLine') as HTMLElement,
    detailCriValue: document.getElementById('detailCriValue') as HTMLElement,
    detailRiskLevel: document.getElementById('detailRiskLevel') as HTMLElement,
    detailScoreBreakdown: document.getElementById('detailScoreBreakdown') as HTMLElement,
    detailStrengths: document.getElementById('detailStrengths') as HTMLElement,
    detailRisks: document.getElementById('detailRisks') as HTMLElement,
    detailPrecautions: document.getElementById('detailPrecautions') as HTMLElement,
    detailActions: document.getElementById('detailActions') as HTMLElement,
    detailFieldChecklist: document.getElementById('detailFieldChecklist') as HTMLElement,
    detailRealtorChecklist: document.getElementById('detailRealtorChecklist') as HTMLElement,
    detailFinalNote: document.getElementById('detailFinalNote') as HTMLElement,

    // Theme
    themeToggle: document.getElementById('themeToggle') as HTMLElement,
    themeKnob: document.getElementById('themeKnob') as HTMLElement,
};

// ==========================================
// 3. Toss Helpers
// ==========================================
function getTossClientKey(): string {
    const key = import.meta.env.VITE_TOSS_CLIENT_KEY;
    if (!key) {
        throw new Error('VITE_TOSS_CLIENT_KEY가 설정되지 않았습니다. 배포 환경 변수를 확인해주세요.');
    }
    return key;
}

function getTossPaymentsInstance() {
    const TossPaymentsFactory = (window as any).TossPayments;

    if (!TossPaymentsFactory) {
        throw new Error('토스페이먼츠 스크립트가 로드되지 않았습니다. mypage.html의 script 태그를 확인해주세요.');
    }

    return TossPaymentsFactory(getTossClientKey());
}

// ==========================================
// 4. Payment State Helpers
// ==========================================
function clearPendingPaymentState() {
    localStorage.removeItem('pending_order_id');
    localStorage.removeItem('pending_product_name');
    localStorage.removeItem('pending_amount');
}

function consumePaymentResultFlags() {
    const paymentCompleted = localStorage.getItem('payment_completed');
    const paymentCompletedOrderId = localStorage.getItem('payment_completed_order_id');
    const paymentCompletedAmount = localStorage.getItem('payment_completed_amount');
    const paymentFailed = localStorage.getItem('payment_failed');
    const paymentFailedMessage = localStorage.getItem('payment_failed_message');

    if (paymentCompleted === '1') {
        localStorage.removeItem('payment_completed');
        localStorage.removeItem('payment_completed_order_id');
        localStorage.removeItem('payment_completed_amount');

        alert(
            `결제가 완료되었어요.\n` +
            `${paymentCompletedOrderId ? `주문번호: ${paymentCompletedOrderId}\n` : ''}` +
            `${paymentCompletedAmount ? `결제금액: ${Number(paymentCompletedAmount).toLocaleString()}원\n` : ''}` +
            `마이페이지의 보유 크레딧이 최신 상태로 반영되었습니다.`
        );
    }

    if (paymentFailed === '1') {
        localStorage.removeItem('payment_failed');
        localStorage.removeItem('payment_failed_message');

        alert(
            `결제가 완료되지 않았어요.\n` +
            `${paymentFailedMessage || '결제 과정에서 오류가 발생했거나 사용자가 취소했습니다.'}`
        );
    }
}

async function checkPaymentResultParam() {
    const params = new URLSearchParams(window.location.search);
    
    if (params.get('payment_fail') === '1') {
        const message = params.get('message') || '결제가 취소되었거나 실패했습니다.';
        clearPendingPaymentState();
        localStorage.setItem('payment_failed', '1');
        localStorage.setItem('payment_failed_message', message);
        
        const cleanUrl = window.location.pathname + (window.location.hash || '');
        window.location.replace(cleanUrl);
        return;
    }
    
    if (params.get('payment_success') === '1') {
        const paymentKey = params.get('paymentKey');
        const orderId = params.get('orderId');
        const amount = params.get('amount');
        
        if (!paymentKey || !orderId || !amount) {
            alert('필수 쿼리 파라미터가 누락되었습니다.');
            return;
        }
        
        try {
            const { data, error } = await supabase.functions.invoke('confirm-toss-payment', {
                body: { paymentKey, orderId, amount: Number(amount) }
            });
            
            if (error || !data?.success) {
                clearPendingPaymentState();
                localStorage.setItem('payment_failed', '1');
                localStorage.setItem('payment_failed_message', `결제 승인 오류: ${data?.error || error?.message || '알 수 없는 오류'}`);
                window.location.replace('/mypage.html');
                return;
            }
            
            clearPendingPaymentState();
            localStorage.setItem('payment_completed', '1');
            localStorage.setItem('payment_completed_order_id', orderId);
            localStorage.setItem('payment_completed_amount', String(amount));
            
            window.location.replace('/mypage.html?credited=1');
        } catch(err: any) {
            clearPendingPaymentState();
            localStorage.setItem('payment_failed', '1');
            localStorage.setItem('payment_failed_message', `결제 승인 오류: ${err.message}`);
            window.location.replace('/mypage.html');
        }
    }
}

// ==========================================
// 5. Initialization
// ==========================================
async function initMypage() {
    setupEventListeners();
    initTheme();
    showLoading();

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_success') || params.get('payment_fail')) {
        await checkPaymentResultParam();
        if (params.get('payment_success')) return; 
    }

    try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            console.error('[mypage auth error]', error);
            window.location.href = '/index.html';
            return;
        }

        const user = data.user;

        if (!user) {
            window.location.href = '/index.html';
            return;
        }

        state.user = user;

        await Promise.all([
            fetchProfile(),
            fetchCredits(),
            fetchRecentReports()
        ]);

        await handleInactiveProfileRejoin();
        
        updateDashboardUI();
        updateProfileUI();
        hideLoading();
        switchView('dashboard');
        consumePaymentResultFlags();
        checkCreditedParam();
        loadProductCards();

        authService.onAuthStateChange(async (nextUser) => {
            if (!nextUser) {
                window.location.href = '/index.html';
                return;
            }

            if (state.user?.id === nextUser.id) return;

            state.user = nextUser;
            showLoading();

            try {
                await Promise.all([
    fetchProfile(),
    fetchCredits(),
    fetchRecentReports()
]);

await handleInactiveProfileRejoin();

updateDashboardUI();
updateProfileUI();
                hideLoading();
                switchView('dashboard');
            } catch (innerError) {
                console.error('Failed to refresh mypage after auth change:', innerError);
                showError('데이터를 다시 불러오는데 실패했습니다.');
            }
        });
    } catch (error) {
        console.error('Failed to initialize mypage:', error);
        showError('데이터를 불러오는데 실패했습니다.');
    }
}

// ==========================================
// 6. Data Fetching
// ==========================================
async function fetchProfile() {
    if (!state.user) return;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    state.profile = data || {
        email: state.user.email,
        full_name: state.user.user_metadata?.full_name,
        plan_type: 'free'
    };
}

async function handleInactiveProfileRejoin() {
    if (!state.profile || state.profile.is_active !== false) return;

    const shouldRejoin = confirm(
        '탈퇴 처리된 계정입니다.\n\n' +
        '재가입을 진행하면:\n' +
        '- 기존 무료 크레딧 2회는 다시 제공되지 않으며\n' +
        '- 남아 있던 크레딧은 복구되지 않고\n' +
        '- 과거 분석 기록은 회원 화면에서 보이지 않습니다.\n\n' +
        '재가입을 진행할까요?'
    );

    if (!shouldRejoin) {
        await authService.logout();
        window.location.href = '/index.html';
        throw new Error('withdrawn_account_cancelled');
    }

    const { data, error } = await supabase.rpc('reactivate_withdrawn_account');

    if (error || !(data as any)?.success) {
        throw new Error(
            (data as any)?.message ||
            error?.message ||
            '재가입 처리 중 오류가 발생했습니다.'
        );
    }

    await Promise.all([
        fetchProfile(),
        fetchCredits(),
        fetchRecentReports()
    ]);

    alert('재가입이 완료되었습니다. 무료 크레딧은 재지급되지 않으며, 과거 분석 기록은 보이지 않습니다.');
}

async function fetchCredits() {
    if (!state.user) return;

    const { data, error } = await supabase
        .from('usage_credits')
        .select('*')
        .eq('user_id', state.user.id)
        .single();

    if (error && error.code !== 'PGRST116') throw error;

    state.credits = data || { total_credits: 0, used_credits: 0 };
}

async function fetchRecentReports() {
    if (!state.user) return;

   const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('user_id', state.user.id)
    .eq('user_visible', true)
    .order('created_at', { ascending: false })
    .limit(3);

    if (error) throw error;

    state.recentReports = data || [];
}

async function fetchAllReports() {
    if (!state.user) return;

    const { data, error } = await supabase
    .from('analysis_results')
    .select('*')
    .eq('user_id', state.user.id)
    .eq('user_visible', true)
    .order('created_at', { ascending: false });

    if (error) throw error;

    state.allReports = data || [];
    renderAllReports(state.allReports);
}

// ==========================================
// 7. UI Updates
// ==========================================
function updateDashboardUI() {
    const name = state.profile?.full_name || state.user?.email?.split('@')[0] || '고객';
    DOM.greetingMsg.textContent = `안녕하세요, ${name}님! 👋`;

    if (state.credits) {
        const totalCredits = Number(state.credits.total_credits ?? 0);
        const usedCredits = Number(state.credits.used_credits ?? 0);
        const remainingCredits = Math.max(totalCredits - usedCredits, 0);

        DOM.creditUsed.textContent = remainingCredits.toString();
        DOM.creditTotal.textContent = totalCredits.toString();

        if (DOM.creditUsageMeta) {
            DOM.creditUsageMeta.textContent = `현재 사용: ${usedCredits}회`;
        }

        if (state.credits.reset_date) {
            const resetDate = new Date(state.credits.reset_date).toLocaleDateString('ko-KR');
            DOM.creditResetDate.textContent = `다음 충전일: ${resetDate}`;
        } else {
            DOM.creditResetDate.textContent = '유효기간 없음 (보유 크레딧 소진 시까지 사용 가능)';
        }
    }

    DOM.recentReportsList.innerHTML = '';

    if (state.recentReports.length === 0) {
        DOM.recentReportsList.classList.add('hidden');
        DOM.emptyRecentState.classList.remove('hidden');
    } else {
        DOM.emptyRecentState.classList.add('hidden');
        DOM.recentReportsList.classList.remove('hidden');

        state.recentReports.forEach(report => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.innerHTML = `
                <div class="report-card-header">
                    <h4>${report.title}</h4>
                </div>
                <div class="report-card-meta">
                    <span>${report.business_type}</span>
                    <span>${new Date(report.created_at).toLocaleDateString()}</span>
                </div>
            `;
            card.addEventListener('click', () => openReportDetail(report));
            DOM.recentReportsList.appendChild(card);
        });
    }
}

function updateProfileUI() {
    DOM.profileEmail.textContent = state.profile?.email || state.user?.email || '-';
    DOM.profileName.textContent = state.profile?.full_name || '-';

    const plan = state.profile?.plan_type || 'free';
    DOM.profilePlan.textContent = plan.toUpperCase();

    if (plan === 'premium') {
        DOM.profilePlan.style.backgroundColor = 'var(--accent-primary)';
    }
}

function renderAllReports(reports: any[]) {
    DOM.allReportsList.innerHTML = '';

    if (reports.length === 0) {
        DOM.allReportsList.classList.add('hidden');
        DOM.emptyAllState.classList.remove('hidden');
    } else {
        DOM.emptyAllState.classList.add('hidden');
        DOM.allReportsList.classList.remove('hidden');

        reports.forEach(report => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.innerHTML = `
                <div class="report-card-header">
                    <h4>${report.title}</h4>
                </div>
                <div class="report-card-meta">
                    <span>📍 ${report.location}</span>
                    <span>${new Date(report.created_at).toLocaleDateString()}</span>
                </div>
            `;
            card.addEventListener('click', () => openReportDetail(report));
            DOM.allReportsList.appendChild(card);
        });
    }
}

function getDisplayRiskLevelLabel(level: string): string {
    if (level === "low") return "낮은 리스크";
    if (level === "medium") return "중간 리스크";
    if (level === "high") return "높은 리스크";
    return level || "-";
}

function renderListItems(container: HTMLElement | null, items: string[]) {
    if (!container) return;
    container.innerHTML = "";
    if (!items || items.length === 0) {
        container.innerHTML = '<li>데이터가 없습니다.</li>';
        return;
    }
    items.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item;
        container.appendChild(li);
    });
}

function openReportDetail(report: any) {
    const data = report.result_data || {};
    
    // Header Info
    DOM.detailTitle.textContent = report.title || "상권 분석 결과";
    DOM.detailDate.textContent = new Date(report.created_at).toLocaleDateString();
    
    if (DOM.detailAddress) {
        const addr = data.location?.address || data.location?.placeName || report.location || "-";
        DOM.detailAddress.textContent = `📍 ${addr}`;
    }

    if (DOM.detailGradeBadge) {
        const grade = data.score?.grade || "-";
        DOM.detailGradeBadge.textContent = grade;
        DOM.detailGradeBadge.className = `grade-badge grade-${grade}`;
    }

    // Conclusion and CRI
    if (DOM.detailOneLine) DOM.detailOneLine.textContent = data.oneLineSummary || data.summary?.one_line || "-";
    
    if (DOM.detailCriValue) {
        const cri = data.cri || data.score?.total || 0;
        DOM.detailCriValue.textContent = typeof cri === 'number' ? Math.round(cri).toString() : String(cri);
    }

    if (DOM.detailRiskLevel) {
        const riskLevelStr = data.score?.risk_level || "-";
        DOM.detailRiskLevel.textContent = getDisplayRiskLevelLabel(riskLevelStr);
        DOM.detailRiskLevel.className = `risk-level-tag risk-${riskLevelStr}`;
    }

    // Breakdown Bars (optional data)
    if (DOM.detailScoreBreakdown) {
        DOM.detailScoreBreakdown.innerHTML = "";
        const bd = data.breakdown || {};
        const metrics = [
            { label: "시장 수요 (크면 위험 증가)", value: bd.market_demand || 0 },
            { label: "경쟁 강도", value: bd.competition || 0 },
            { label: "재무적 압박", value: bd.financial_pressure || 0 },
            { label: "구조적 안정성", value: bd.structural_stability || 0 }
        ];

        metrics.forEach(m => {
            const wrap = document.createElement("div");
            wrap.className = "cri-bar-item";
            wrap.innerHTML = `
                <div class="cri-bar-label">
                    <span>${m.label}</span>
                    <span>${Math.round(m.value)}</span>
                </div>
                <div class="cri-bar-bg">
                    <div class="cri-bar-fill" style="width: ${m.value}%"></div>
                </div>
            `;
            DOM.detailScoreBreakdown.appendChild(wrap);
        });
    }

    // Content Lists
    const strengths = data.summary?.strengths || [];
    renderListItems(DOM.detailStrengths, strengths);

    const risks = data.keyRisks || data.summary?.risk || [];
    renderListItems(DOM.detailRisks, risks);

    if (DOM.detailPrecautions) {
        DOM.detailPrecautions.textContent = data.precautions || data.summary?.precautions || "-";
    }

    const actions = data.recommendedActions || data.summary?.recommendations || [];
    renderListItems(DOM.detailActions, actions);

    const fieldCheck = data.field_checklist || data.summary?.field_checklist || [];
    renderListItems(DOM.detailFieldChecklist, fieldCheck);

    const realtorCheck = data.realtor_checklist || data.summary?.realtor_checklist || [];
    renderListItems(DOM.detailRealtorChecklist, realtorCheck);

    if (DOM.detailFinalNote) {
        DOM.detailFinalNote.textContent = data.summary?.local_verification_note || 
            "현장 중심의 확인이 언제나 예측 데이터보다 우선되어야 합니다.";
    }

    switchView('report-detail');
}


// ==========================================
// 8. Payment — 상품 카드 렌더링
// ==========================================
async function loadProductCards() {
    try {
        const products = await fetchActiveCreditProducts();
        renderProductCards(products);
    } catch (err) {
        console.error('[loadProductCards]', err);
        if (DOM.productCards) {
            DOM.productCards.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">상품 정보를 불러오지 못했습니다. 페이지를 새로고침 해주세요.</p>`;
        }
    }
}

function renderProductCards(products: import('./services/paymentService').CreditProduct[]) {
    if (!DOM.productCards) return;

    const regularProducts = products.filter(p => !p.is_b2b_only);
    const b2bProducts = products.filter(p => p.is_b2b_only);

    const remainingCredits = state.credits
        ? Math.max(Number(state.credits.total_credits ?? 0) - Number(state.credits.used_credits ?? 0), 0)
        : 0;

    const cardMeta: Record<string, { features: string[]; recommended?: boolean; btnLabel: string; tagline: string }> = {
        'Starter Pack': {
            features: ['10회 분석 크레딧 즉시 지급', '후보지 3~5곳 비교 분석 가능', '입지 선택 전 빠른 검증에 최적', '크레딧 만료 없음'],
            btnLabel: '스타터로 시작하기',
            tagline: '처음 충전에 딱 맞는 선택',
        },
        'Growth Pack': {
            features: ['20회 분석 크레딧 즉시 지급', '여러 업종·지역 연속 비교 가능', '회당 최저 단가 (≈8,500원/회)', '크레딧 만료 없음'],
            recommended: true,
            btnLabel: '그로스로 충전하기',
            tagline: '자주 분석하는 분께 추천',
        },
    };

    DOM.productCards.innerHTML = '';

    regularProducts.forEach((product) => {
        const meta = cardMeta[product.name] ?? {
            features: [`${product.total_credits}회 분석 크레딧`],
            btnLabel: '지금 충전하기',
            tagline: '',
        };

        const unitPrice = product.total_credits > 0
            ? Math.round(product.price / product.total_credits).toLocaleString('ko-KR')
            : '-';

        const bonusText = product.bonus_credits > 0
            ? `기본 ${product.base_credits}회 + 보너스 <span class="credits-bold">+${product.bonus_credits}회</span>`
            : `<span class="credits-bold">${product.base_credits}회</span> 분석 크레딧`;

        const card = document.createElement('div');
        card.className = `product-card${meta.recommended ? ' recommended' : ''}`;
        card.innerHTML = `
            ${meta.recommended ? '<span class="badge-recommended">⭐ 가장 인기</span>' : ''}
            <span class="card-badge-text">${meta.tagline}</span>
            <p class="card-name">${product.name}</p>
            <div class="card-price">
                ${product.price.toLocaleString('ko-KR')}<span class="price-unit">원</span>
            </div>
            <p class="card-credits">${bonusText} = <span class="credits-bold">총 ${product.total_credits}회</span></p>
            <p class="card-unit-price">약 ${unitPrice}원 / 회</p>
            <hr class="card-divider">
            <ul class="card-features">
                ${meta.features.map(f => `<li>${f}</li>`).join('')}
            </ul>
            <button class="product-btn btn-primary-card" data-product-id="${product.id}">${meta.btnLabel}</button>
        `;

        const btn = card.querySelector('button') as HTMLButtonElement;

        card.addEventListener('mouseenter', () => {
            if (!DOM.creditPreviewBox || !DOM.creditPreviewAmount) return;
            const afterCredits = remainingCredits + product.total_credits;
            DOM.creditPreviewAmount.textContent = `${afterCredits}회`;
            DOM.creditPreviewBox.style.display = 'flex';
        });

        card.addEventListener('mouseleave', () => {
            if (DOM.creditPreviewBox) DOM.creditPreviewBox.style.display = 'none';
        });

        btn.addEventListener('click', () => handleProductPurchase(product, btn));
        DOM.productCards.appendChild(card);
    });

    b2bProducts.forEach((product) => {
        const card = document.createElement('div');
        card.className = 'product-card b2b';
        card.innerHTML = `
            <span class="card-badge-text">팀·프랜차이즈·법인</span>
            <p class="card-name">${product.name.replace(' / B2B', '')}</p>
            <div class="card-price">
                별도 문의
            </div>
            <p class="card-credits">맞춤 크레딧·기간·권한 협의</p>
            <p class="card-unit-price">팀 단위 대량 분석에 최적화</p>
            <hr class="card-divider">
            <ul class="card-features">
                <li>무제한 팀원 공유</li>
                <li>전담 CS 지원</li>
                <li>대시보드·리포트 커스터마이징</li>
                <li>세금계산서 발행 가능</li>
            </ul>
            <a href="mailto:contact@zaribogo.com?subject=Pro%20%2F%20B2B%20문의" class="product-btn btn-outline-card" style="text-align:center;display:block;text-decoration:none;line-height:2.2">문의하기</a>
        `;
        DOM.productCards.appendChild(card);
    });
}

async function handleProductPurchase(
    product: import('./services/paymentService').CreditProduct,
    btn: HTMLButtonElement
) {
    try {
        btn.disabled = true;
        btn.textContent = '결제창 준비 중...';

        const paymentInit = await initiatePaymentFlow(product.id);

        localStorage.setItem('pending_order_id', paymentInit.order_id);
        localStorage.setItem('pending_product_name', paymentInit.product_name);
        localStorage.setItem('pending_amount', String(paymentInit.amount));

        const tossPayments = getTossPaymentsInstance();
        await tossPayments.requestPayment('카드', {
            amount: paymentInit.amount,
            orderId: paymentInit.order_id,
            orderName: `${paymentInit.product_name} · ${paymentInit.total_credits}회 분석 크레딧`,
            customerEmail: paymentInit.user_email || undefined,
            successUrl: `${window.location.origin}/mypage.html?payment_success=1`,
            failUrl: `${window.location.origin}/mypage.html?payment_fail=1`,
        });
    } catch (err) {
        clearPendingPaymentState();
        console.error('[handleProductPurchase]', err);
        alert(err instanceof Error ? err.message : '결제 시작 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;

        const originalLabel = btn.closest('.product-card')?.querySelector('.card-name')?.textContent;
        if (originalLabel?.includes('Starter')) btn.textContent = '스타터로 시작하기';
        else if (originalLabel?.includes('Growth')) btn.textContent = '그로스로 충전하기';
        else btn.textContent = '지금 충전하기';
    }
}

// ==========================================
// 9. 결제 성공 배너
// ==========================================
function checkCreditedParam() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credited') === '1') {
        if (DOM.creditSuccessBanner) {
            DOM.creditSuccessBanner.classList.remove('hidden');
            setTimeout(() => {
                DOM.creditSuccessBanner?.classList.add('hidden');
            }, 6000);
        }

        const cleanUrl = window.location.pathname + (window.location.hash || '');
        history.replaceState(null, '', cleanUrl);
    }
}

// ==========================================
// 10. Navigation & Setup
// ==========================================
function switchView(viewId: string) {
    state.currentView = viewId as any;

    DOM.views.forEach(view => {
        view.classList.remove('active');
        view.classList.add('hidden');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }

    DOM.navLinks.forEach(link => {
        if (link.getAttribute('data-target') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    if (viewId === 'reports' && state.allReports.length === 0) {
        showLoading();
        fetchAllReports().finally(() => hideLoading());
    }

    if (viewId === 'billing') {
        loadPaymentHistory();
    }
}

function setupEventListeners() {
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = (e.currentTarget as HTMLElement).getAttribute('data-target');
            if (target) switchView(target);
        });
    });

    const goMain = () => window.location.href = '/index.html';

    DOM.logoToMain.addEventListener('click', goMain);
    DOM.btnBackToMain.addEventListener('click', goMain);
    DOM.btnAnalyzeNow.addEventListener('click', goMain);
    DOM.btnStartFirst.addEventListener('click', goMain);

    DOM.btnLogout.addEventListener('click', async () => {
        await authService.logout();
        goMain();
    });

        setupWithdrawModalListeners();
    DOM.btnViewAllReports.addEventListener('click', () => switchView('reports'));
    DOM.btnBackToList.addEventListener('click', () => switchView('reports'));

    DOM.btnCloseBanner?.addEventListener('click', () => {
        DOM.creditSuccessBanner?.classList.add('hidden');
    });

    DOM.btnRetry.addEventListener('click', () => {
        initMypage();
    });

    DOM.searchInput.addEventListener('input', (e) => {
        const term = (e.target as HTMLInputElement).value.toLowerCase();
        const filtered = state.allReports.filter(r =>
            r.title.toLowerCase().includes(term) ||
            r.location.toLowerCase().includes(term) ||
            r.business_type.toLowerCase().includes(term)
        );
        renderAllReports(filtered);
    });

    DOM.themeToggle.addEventListener('click', () => {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        DOM.themeKnob.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    DOM.themeKnob.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
}

function showLoading() {
    DOM.views.forEach(v => v.classList.remove('active'));
    DOM.errorState.classList.add('hidden');
    DOM.loadingState.classList.remove('hidden');
}

function hideLoading() {
    DOM.loadingState.classList.add('hidden');
}

function showError(msg: string) {
    hideLoading();
    DOM.views.forEach(v => v.classList.remove('active'));
    DOM.errorMessage.textContent = msg;
    DOM.errorState.classList.remove('hidden');
}

// ==========================================
// 11. 회원탈퇴
// ==========================================
let withdrawListenersAttached = false;

function openWithdrawModal() {
    DOM.withdrawReasonType.value = '';
    DOM.withdrawReasonDetail.value = '';
    DOM.withdrawReasonDetailLength.textContent = '0';
    DOM.withdrawConfirmCheck.checked = false;
    DOM.withdrawResultBox.className = 'withdraw-result-box hidden';
    DOM.withdrawForm.style.display = 'block';
    DOM.withdrawModalActions.style.display = 'flex';
    DOM.btnWithdrawSubmit.style.display = '';
    DOM.btnWithdrawSubmit.disabled = false;
    DOM.btnWithdrawSubmit.textContent = '탈퇴 진행';
    DOM.btnWithdrawCancel.textContent = '취소';

    DOM.withdrawModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        DOM.withdrawReasonType.focus();
    }, 100);
}

function closeWithdrawModal() {
    DOM.withdrawModal.classList.add('hidden');
    document.body.style.overflow = '';
}

function setWithdrawLocked(locked: boolean) {
    DOM.btnWithdrawSubmit.disabled = locked;
    DOM.btnWithdrawCancel.disabled = locked;
    DOM.btnWithdrawClose.disabled = locked;
    DOM.withdrawReasonType.disabled = locked;
    DOM.withdrawReasonDetail.readOnly = locked;
    DOM.withdrawConfirmCheck.disabled = locked;
}

function showWithdrawResult(type: 'success' | 'error', message?: string) {
    if (type === 'success') {
        DOM.withdrawResultIcon.textContent = '✅';
        DOM.withdrawResultTitle.textContent = '회원탈퇴가 완료되었습니다';
        DOM.withdrawResultDesc.textContent = '잠시 후 자동으로 로그아웃됩니다.';
        DOM.withdrawResultBox.className = 'withdraw-result-box result-success';
        DOM.withdrawForm.style.display = 'none';
        DOM.btnWithdrawSubmit.style.display = 'none';
        DOM.btnWithdrawCancel.textContent = '닫기';
        return;
    }

    DOM.withdrawResultIcon.textContent = '❌';
    DOM.withdrawResultTitle.textContent = '회원탈퇴 처리에 실패했습니다';
    DOM.withdrawResultDesc.textContent = message || '잠시 후 다시 시도해주세요.';
    DOM.withdrawResultBox.className = 'withdraw-result-box result-error';
}

async function submitWithdrawRequest() {
    const reasonType = DOM.withdrawReasonType.value.trim();
    const reasonDetail = DOM.withdrawReasonDetail.value.trim();
    const confirmed = DOM.withdrawConfirmCheck.checked;

    if (!reasonType) {
        DOM.withdrawReasonType.focus();
        return;
    }

    if (!confirmed) {
        DOM.withdrawConfirmCheck.focus();
        return;
    }

    setWithdrawLocked(true);
    DOM.btnWithdrawSubmit.textContent = '탈퇴 처리 중...';

    try {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
            throw new Error(`세션 갱신 실패: ${refreshError.message}`);
        }

        const session = refreshed.session;

        if (!session?.access_token) {
            throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인 후 시도해주세요.');
        }

        const { data, error } = await supabase.functions.invoke('withdraw-account', {
            body: {
                reasonType,
                reasonDetail,
            },
        });

        let parsedMessage = (data as any)?.message;
        let parsedDetail = (data as any)?.detail;

        if (error && (error as any).context && typeof (error as any).context.json === 'function') {
            try {
                const errJson = await (error as any).context.json();
                parsedMessage = parsedMessage || errJson?.message;
                parsedDetail = parsedDetail || errJson?.detail;
                console.error('[withdraw invoke error json]', errJson);
            } catch (parseErr) {
                console.error('[withdraw invoke error parse failed]', parseErr);
            }
        }

        if (error || !(data as any)?.success) {
            console.error('[withdraw invoke error]', { error, data, parsedMessage, parsedDetail });
            throw new Error(
                parsedDetail ||
                parsedMessage ||
                (error as any)?.message ||
                '탈퇴 처리 중 오류가 발생했습니다.'
            );
        }

        showWithdrawResult('success');

        setTimeout(async () => {
            await authService.logout();
            window.location.href = '/index.html';
        }, 1400);
    } catch (err) {
        console.error('[submitWithdrawRequest]', err);
        showWithdrawResult(
            'error',
            err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
        );
        setWithdrawLocked(false);
        DOM.btnWithdrawSubmit.textContent = '탈퇴 진행';
    }
}

function setupWithdrawModalListeners() {
    if (withdrawListenersAttached) return;
    withdrawListenersAttached = true;

    DOM.btnWithdrawOpen?.addEventListener('click', openWithdrawModal);
    DOM.btnWithdrawClose?.addEventListener('click', closeWithdrawModal);
    DOM.btnWithdrawCancel?.addEventListener('click', closeWithdrawModal);
    DOM.btnWithdrawSubmit?.addEventListener('click', submitWithdrawRequest);

    DOM.withdrawReasonDetail?.addEventListener('input', () => {
        DOM.withdrawReasonDetailLength.textContent = String(DOM.withdrawReasonDetail.value.length);
    });

    DOM.withdrawModal?.addEventListener('click', (e) => {
        if (e.target === DOM.withdrawModal) {
            closeWithdrawModal();
        }
    });
}

// Start
document.addEventListener('DOMContentLoaded', initMypage);

// ==========================================
// 12. 결제 내역 및 환불 요청
// ==========================================
interface PaymentRecord {
    id: string;
    order_id: string;
    product_id: string | null;
    amount: number;
    status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refund_requested' | 'refunded';
    paid_at: string | null;
    created_at: string;
    credit_products?: {
        name: string;
        total_credits: number;
    };
}

let activeRefundPayment: PaymentRecord | null = null;
let isLoadingPaymentHistory = false;
let needsPaymentHistoryRefresh = false;

function showBillingSkeletons() {
    if (!DOM.paymentHistoryList) return;
    DOM.paymentHistoryList.innerHTML = Array.from({ length: 3 })
        .map(() => '<div class="payment-card-skeleton"></div>')
        .join('');
}

async function loadPaymentHistory() {
    if (!state.user || !DOM.paymentHistoryList || isLoadingPaymentHistory) return;
    isLoadingPaymentHistory = true;

    DOM.billingLoading.classList.remove('hidden');
    showBillingSkeletons();
    DOM.billingEmptyState.classList.add('hidden');

    try {
        const { data, error } = await supabase
            .from('payments')
            .select('id, order_id, product_id, amount, status, paid_at, created_at')
            .eq('user_id', state.user.id)
            .in('status', ['paid', 'cancelled', 'refund_requested', 'refunded'])
            .order('created_at', { ascending: false })
            .limit(20);

        DOM.billingLoading.classList.add('hidden');
        DOM.paymentHistoryList.innerHTML = '';

        if (error) {
            console.error('[loadPaymentHistory] payments error', error);
            DOM.paymentHistoryList.innerHTML =
                '<p style="color:var(--text-muted);font-size:0.85rem">결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
            return;
        }

        const payments = (data ?? []) as PaymentRecord[];

        if (payments.length === 0) {
            DOM.billingEmptyState.classList.remove('hidden');
            return;
        }

        const productIds = Array.from(
            new Set(
                payments
                    .map(payment => payment.product_id)
                    .filter((id): id is string => Boolean(id))
            )
        );

        let productMap = new Map<string, { name: string; total_credits: number }>();

        if (productIds.length > 0) {
            const { data: productRows, error: productError } = await supabase
                .from('credit_products')
                .select('id, name, total_credits')
                .in('id', productIds);

            if (productError) {
                console.error('[loadPaymentHistory] credit_products error', productError);
            } else {
                productMap = new Map(
                    (productRows ?? []).map((row: any) => [
                        row.id,
                        { name: row.name, total_credits: row.total_credits },
                    ])
                );
            }
        }

        const enrichedPayments: PaymentRecord[] = payments.map(payment => ({
            ...payment,
            credit_products: payment.product_id ? productMap.get(payment.product_id) : undefined,
        }));

        renderPaymentHistory(enrichedPayments);
        setupRefundModalListeners();
    } catch (err) {
        console.error('[loadPaymentHistory] unexpected error', err);
        DOM.billingLoading.classList.add('hidden');
        DOM.paymentHistoryList.innerHTML =
            '<p style="color:var(--text-muted);font-size:0.85rem">결제 내역을 불러오지 못했습니다.</p>';
    } finally {
        isLoadingPaymentHistory = false;
    }
}

function getStatusBadge(status: PaymentRecord['status']): string {
    const map: Record<string, [string, string]> = {
        paid: ['badge-paid', '● 결제 완료'],
        cancelled: ['badge-cancelled', '● 취소됨'],
        refund_requested: ['badge-refund-requested', '▲ 환불 요청됨'],
        refunded: ['badge-refunded', '◆ 환불 완료'],
        failed: ['badge-cancelled', '● 결제 실패'],
        pending: ['badge-cancelled', '∙ 처리 중'],
    };
    const [cls, label] = map[status] ?? ['badge-cancelled', status];
    return `<span class="payment-status-badge ${cls}">${label}</span>`;
}

function renderPaymentHistory(payments: PaymentRecord[]) {
    if (!DOM.paymentHistoryList) return;
    DOM.paymentHistoryList.innerHTML = '';

    payments.forEach(payment => {
        const productName = payment.credit_products?.name ?? '상품';
        const totalCredits = payment.credit_products?.total_credits;
        const paidDate = payment.paid_at
            ? new Date(payment.paid_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
            : new Date(payment.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

        const refundBtnHtml = payment.status === 'paid'
            ? `<button class="btn-request-refund" data-payment-id="${payment.id}">↩ 환불 요청</button>`
            : payment.status === 'refund_requested'
                ? `<span style="font-size:0.8rem;color:rgb(251,191,36);margin-top:10px;display:inline-block">⏳ 운영팀 검토 중</span>`
                : payment.status === 'refunded'
                    ? `<span style="font-size:0.8rem;color:rgb(129,140,248);margin-top:10px;display:inline-block">✔ 환불 완료 (카드사 반영 대기 가능)</span>`
                    : '';

        const statusHintMap: Partial<Record<PaymentRecord['status'], string>> = {
            paid: '미사용 결제 건은 자동 환불 대상이 될 수 있습니다.',
            refund_requested: '운영팀 검토 후 이메일로 안내드립니다.',
            refunded: '카드사 반영까지 영업일 1~5일 소요될 수 있습니다.',
        };

        const statusHint = statusHintMap[payment.status]
            ? `<p class="payment-card-status-hint">${statusHintMap[payment.status]}</p>`
            : '';

        const card = document.createElement('div');
        card.className = 'payment-history-card';
        card.dataset.paymentId = payment.id;
        card.innerHTML = `
            <div class="payment-card-body">
                <div class="payment-card-top">
                    <span class="payment-card-name">${productName}</span>
                    ${getStatusBadge(payment.status)}
                </div>
                <div class="payment-card-meta">
                    <span>📅 ${paidDate}</span>
                    ${totalCredits ? `<span>📊 ${totalCredits}회 크레딧</span>` : ''}
                </div>
                <p class="payment-card-order-id">주문번호: ${payment.order_id}</p>
                ${refundBtnHtml}
                ${statusHint}
            </div>
            <div class="payment-card-amount">
                ${payment.amount.toLocaleString('ko-KR')}원
                ${totalCredits ? `<span class="amount-credits">${totalCredits}회 충전</span>` : ''}
            </div>
        `;

        const refundBtn = card.querySelector('.btn-request-refund') as HTMLButtonElement | null;
        if (refundBtn) {
            refundBtn.addEventListener('click', () => openRefundModal(payment));
        }

        DOM.paymentHistoryList.appendChild(card);
    });
}

// ==========================================
// 13. 환불 모달
// ==========================================
function openRefundModal(payment: PaymentRecord) {
    activeRefundPayment = payment;

    const productName = payment.credit_products?.name ?? '상품';
    const paidDate = payment.paid_at
        ? new Date(payment.paid_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
        : '—';

    DOM.refundProductName.textContent = productName;
    DOM.refundAmount.textContent = `${payment.amount.toLocaleString('ko-KR')}원`;
    DOM.refundOrderId.textContent = payment.order_id;
    DOM.refundPaidAt.textContent = paidDate;

    DOM.refundReason.value = '';
    DOM.refundReasonLength.textContent = '0';
    DOM.refundResultBox.className = 'refund-result-box hidden';
    DOM.refundForm.style.display = 'block';
    DOM.refundModalActions.style.display = 'flex';
    DOM.btnRefundSubmit.disabled = false;
    DOM.btnRefundSubmit.style.display = '';
    DOM.btnRefundSubmit.textContent = '환불 요청 제출';
    DOM.btnRefundCancel.textContent = '취소';

    DOM.refundModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => DOM.refundReason.focus(), 100);
}

function closeRefundModal() {
    DOM.refundModal.classList.add('hidden');
    document.body.style.overflow = '';
    activeRefundPayment = null;

    if (needsPaymentHistoryRefresh) {
        needsPaymentHistoryRefresh = false;
        loadPaymentHistory();
    }
}

function setRefundSubmitLocked(locked: boolean) {
    DOM.btnRefundSubmit.disabled = locked;
    DOM.btnRefundModalClose.disabled = locked;
    DOM.btnRefundCancel.disabled = locked;
    DOM.refundReason.readOnly = locked;

    const inner = DOM.refundModal?.querySelector('.refund-modal') as HTMLElement | null;
    if (inner) inner.style.pointerEvents = locked ? 'none' : '';
}

async function submitRefundRequest() {
    if (!activeRefundPayment) return;

    const reason = DOM.refundReason.value.trim();
    if (!reason) {
        DOM.refundReason.focus();
        DOM.refundReason.style.borderColor = 'rgb(248, 113, 113)';
        setTimeout(() => {
            DOM.refundReason.style.borderColor = '';
        }, 2000);
        return;
    }

    setRefundSubmitLocked(true);
    DOM.btnRefundSubmit.textContent = '요청 제출 중...';

    try {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
            throw new Error(`세션 확인 실패: ${sessionError.message}`);
        }

        if (!session?.access_token) {
            throw new Error('로그인 세션이 없어 환불 요청을 보낼 수 없습니다. 다시 로그인해주세요.');
        }

        const { data: responseData, error } = await supabase.functions.invoke('request-refund-review', {
            body: {
                orderId: activeRefundPayment.order_id,
                cancelReason: reason,
            },
        });

        let parsedError = responseData?.error;
        if (error && error.context && typeof error.context.json === 'function') {
            try {
                const errJson = await error.context.json();
                parsedError = parsedError || errJson?.error;
            } catch {
                // ignore
            }
        }

        const derivedErrorMessage =
            parsedError ||
            responseData?.detail ||
            error?.message ||
            '환불 요청 처리 중 오류가 발생했습니다.';

        if (
            typeof parsedError === 'string' &&
            parsedError.toLowerCase().includes('already exists')
        ) {
            showRefundResult('duplicate');
            updatePaymentCardStatus(activeRefundPayment.id, 'refund_requested');
            needsPaymentHistoryRefresh = true;
            return;
        }

        if (error || !responseData?.success) {
            throw new Error(derivedErrorMessage);
        }

        const autoRefundEligible = Boolean(responseData?.data?.autoRefundEligible);
        const autoRefundCompleted = Boolean(responseData?.data?.autoRefundCompleted);

        if (autoRefundCompleted) {
            showRefundResult('auto_refund_completed');
            updatePaymentCardStatus(activeRefundPayment.id, 'refunded');
            needsPaymentHistoryRefresh = true;
            return;
        }

        if (autoRefundEligible) {
            showRefundResult('auto_refund_pending');
            updatePaymentCardStatus(activeRefundPayment.id, 'refund_requested');
            needsPaymentHistoryRefresh = true;
            return;
        }

        showRefundResult('review_needed');
        updatePaymentCardStatus(activeRefundPayment.id, 'refund_requested');
        needsPaymentHistoryRefresh = true;
    } catch (err) {
        console.error('[submitRefundRequest]', err);
        showRefundResult(
            'error',
            err instanceof Error ? err.message : '오류가 발생했습니다.'
        );
    } finally {
        setRefundSubmitLocked(false);
        DOM.btnRefundSubmit.textContent = '환불 요청 제출';
    }
}

type RefundResultType =
    | 'auto_refund_completed'
    | 'auto_refund_pending'
    | 'review_needed'
    | 'duplicate'
    | 'error';

function showRefundResult(type: RefundResultType, errMsg?: string) {
    const configs: Record<RefundResultType, { icon: string; title: string; desc: string; cls: string }> = {
        auto_refund_completed: {
            icon: '✅',
            title: '자동 환불이 완료되었습니다',
            desc: '분석 이력이 없는 결제 건으로 확인되어 자동 승인 및 환불 완료 처리되었습니다. 카드사 반영 시점에 따라 실제 입금 반영까지 영업일 1~5일 정도 소요될 수 있습니다.',
            cls: 'result-success',
        },
        auto_refund_pending: {
            icon: '🟢',
            title: '자동 환불이 승인되었습니다',
            desc: '분석 이력이 없는 결제 건으로 확인되었습니다. 환불이 정상 접수되었으며 카드사 반영까지는 영업일 기준 1~5일 정도 소요될 수 있습니다.',
            cls: 'result-success',
        },
        review_needed: {
            icon: '📋',
            title: '환불 요청이 접수되었습니다',
            desc: '이미 사용한 크레딧 또는 검토가 필요한 결제 건으로 확인되어 운영팀 검토 후 처리됩니다. 영업일 기준 1~3일 내 이메일로 안내드립니다.',
            cls: 'result-warning',
        },
        duplicate: {
            icon: '⚠️',
            title: '이미 요청된 환불 건입니다',
            desc: '해당 결제 건에는 이미 환불 요청이 접수되어 있습니다. 추가 문의는 contact@zaribogo.com으로 부탁드립니다.',
            cls: 'result-info',
        },
        error: {
            icon: '❌',
            title: '요청에 실패했습니다',
            desc: errMsg ?? '잠시 후 다시 시도하거나 contact@zaribogo.com으로 문의해주세요.',
            cls: 'result-error',
        },
    };

    const cfg = configs[type];
    DOM.refundResultIcon.textContent = cfg.icon;
    DOM.refundResultTitle.textContent = cfg.title;
    DOM.refundResultDesc.textContent = cfg.desc;
    DOM.refundResultBox.className = `refund-result-box ${cfg.cls}`;

    if (type === 'error') {
        return;
    }

    DOM.refundForm.style.display = 'none';
    DOM.btnRefundSubmit.style.display = 'none';
    DOM.btnRefundCancel.disabled = false;
    DOM.btnRefundCancel.textContent = '닫기';
}

function updatePaymentCardStatus(paymentId: string, newStatus: PaymentRecord['status']) {
    const card = DOM.paymentHistoryList?.querySelector(`[data-payment-id="${paymentId}"]`);
    if (!card) return;

    const badgeEl = card.querySelector('.payment-status-badge');
    if (badgeEl) {
        badgeEl.outerHTML = getStatusBadge(newStatus);
    }

    const refundBtn = card.querySelector('.btn-request-refund');
    if (!refundBtn) return;

    if (newStatus === 'refunded') {
        refundBtn.outerHTML =
            '<span style="font-size:0.8rem;color:rgb(129,140,248);margin-top:10px;display:inline-block">✔ 환불 완료 (카드사 반영 대기 가능)</span>';
        return;
    }

    if (newStatus === 'refund_requested') {
        refundBtn.outerHTML =
            '<span style="font-size:0.8rem;color:rgb(251,191,36);margin-top:10px;display:inline-block">⏳ 운영팀 검토 중</span>';
        return;
    }

    refundBtn.outerHTML = '';
}

let refundListenersAttached = false;

function setupRefundModalListeners() {
    if (refundListenersAttached) return;
    refundListenersAttached = true;

    DOM.btnRefundModalClose?.addEventListener('click', closeRefundModal);
    DOM.btnRefundCancel?.addEventListener('click', closeRefundModal);
    DOM.btnRefundSubmit?.addEventListener('click', submitRefundRequest);

    DOM.refundReason?.addEventListener('input', () => {
        DOM.refundReasonLength.textContent = String(DOM.refundReason.value.length);
    });

    DOM.refundModal?.addEventListener('click', (e) => {
        if (e.target === DOM.refundModal) {
            closeRefundModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !DOM.refundModal?.classList.contains('hidden')) {
            closeRefundModal();
        }
    });
}
