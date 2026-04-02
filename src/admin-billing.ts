/**
 * [수정 기준 요약 - 실제 DB 스키마 동기화]
 * 1. refund_requests 테이블 컬럼 반영: 기존 status, auto_refund_eligible, processed_at 등을
 *    실제 존재하는 request_status, admin_note 컬럼으로 변경했습니다.
 * 2. 상태값(request_status) 매핑 수정: pending/auto_approved 대신
 *    requested(검토 대기), approved(승인 대기/자동 환불 대상), completed(환불 완료)를 사용합니다.
 * 3. 자동 환불 판별: admin_note 필드에 'AUTO' 문자열이 포함되었는지 여부로 자동 환불 대상을 구분합니다.
 * 4. 자동 환불 완료 건수(지표): refund_requests 보다는 결제 관점에서 최종 성공을 의미하는
 *    payments 테이블의 status = 'refunded'를 기준으로 삼도록 수정(Source of Truth) 및 주석 추가했습니다.
 * 5. [추가] refunds 로드 후 updateSummaryCards() 추가 호출, UI 상의 해당 "자동 환불 완료" 라벨을 "환불 완료"로 수정하여 의미 혼란 방지.
 * 6. [추가] cancel-payment 호출 시 현재 로그인 세션의 access_token(JWT)을 명시적으로 Authorization 헤더에 넣어 전달하도록 수정했습니다.
 *    기존 401 Invalid JWT 문제 해결 목적입니다.
 */

import { supabase } from './services/supabase';

// ============================================================
// 환경 변수
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_BROWSER_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SUPABASE_LEGACY_ANON_KEY = import.meta.env.VITE_SUPABASE_LEGACY_ANON_KEY as string | undefined;

/**
 * Edge Function 호출용 apikey
 * - publishable/browser key 우선
 * - 없으면 legacy anon key fallback
 */
const SUPABASE_FUNCTION_KEY = SUPABASE_BROWSER_KEY || SUPABASE_LEGACY_ANON_KEY;

// ============================================================
// 타입 정의
// ============================================================

interface AdminPayment {
    id: string;
    user_id: string;
    product_id: string | null;
    order_id: string;
    amount: number;
    status: string;
    pg_provider: string | null;
    pg_tid: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
    user_email?: string;
    product_name?: string;
}

interface RefundRequest {
    id: string;
    order_id: string;
    user_id: string;
    cancel_reason: string;
    request_status: string;
    admin_note: string | null;
    created_at: string;
}

interface PaymentEvent {
    id: string;
    payment_id: string;
    event_type: string;
    payload: Record<string, unknown> | null;
    created_at: string;
}

interface EdgeFunctionErrorResponse {
    code?: number | string;
    message?: string;
    error?: string;
    details?: string;
    success?: boolean;
}

interface CancelPaymentSuccessResponse {
    success?: boolean;
    message?: string;
    error?: string;
    [key: string]: unknown;
}

// ============================================================
// 관리자 권한 체크
// ============================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[checkAdminAccess] profiles 조회 실패:', error.message);
            return false;
        }

        return data?.is_admin === true;
    } catch (err) {
        console.error('[checkAdminAccess] 예외 발생:', err);
        return false;
    }
}

// ============================================================
// 상태
// ============================================================

const adminState = {
    currentTab: 'payments' as 'payments' | 'refunds',
    payments: [] as AdminPayment[],
    refunds: [] as RefundRequest[],
    paymentStatusFilter: '',
    refundStatusFilter: '',
    paymentSearch: '',
    refundSearch: '',
};

// ============================================================
// DOM
// ============================================================

const D = {
    app:                document.getElementById('admin-app') as HTMLElement,
    loadingState:       document.getElementById('adminLoadingState') as HTMLElement,
    accessDeniedState:  document.getElementById('accessDeniedState') as HTMLElement,
    adminUserEmail:     document.getElementById('adminUserEmail') as HTMLElement,
    btnAdminLogout:     document.getElementById('btnAdminLogout') as HTMLButtonElement,
    navLinks:           document.querySelectorAll('.admin-nav-link'),

    tabPayments:        document.getElementById('tab-payments') as HTMLElement,
    btnRefreshPayments: document.getElementById('btnRefreshPayments') as HTMLButtonElement,
    paymentSearchInput: document.getElementById('paymentSearchInput') as HTMLInputElement,
    paymentStatusFilters: document.getElementById('paymentStatusFilters') as HTMLElement,
    paymentsTableBody:  document.getElementById('paymentsTableBody') as HTMLElement,
    paymentsEmpty:      document.getElementById('paymentsEmpty') as HTMLElement,

    tabRefunds:         document.getElementById('tab-refunds') as HTMLElement,
    btnRefreshRefunds:  document.getElementById('btnRefreshRefunds') as HTMLButtonElement,
    refundSearchInput:  document.getElementById('refundSearchInput') as HTMLInputElement,
    refundStatusFilters: document.getElementById('refundStatusFilters') as HTMLElement,
    refundsTableBody:   document.getElementById('refundsTableBody') as HTMLElement,
    refundsEmpty:       document.getElementById('refundsEmpty') as HTMLElement,

    eventDrawer:        document.getElementById('eventDrawer') as HTMLElement,
    drawerOverlay:      document.getElementById('drawerOverlay') as HTMLElement,
    btnCloseDrawer:     document.getElementById('btnCloseDrawer') as HTMLButtonElement,
    drawerOrderId:      document.getElementById('drawerOrderId') as HTMLElement,
    eventTimeline:      document.getElementById('eventTimeline') as HTMLElement,
    eventTimelineEmpty: document.getElementById('eventTimelineEmpty') as HTMLElement,

    summaryTodayPaid:    document.getElementById('summaryTodayPaid') as HTMLElement,
    summaryRefundPending: document.getElementById('summaryRefundPending') as HTMLElement,
    summaryAutoRefunded: document.getElementById('summaryAutoRefunded') as HTMLElement,
    summaryFailed:       document.getElementById('summaryFailed') as HTMLElement,
};

// ============================================================
// 공통 유틸: 인증된 Edge Function 호출
// ============================================================

async function getCurrentAccessToken(): Promise<string> {
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error) {
        throw new Error(`세션 확인 중 오류가 발생했습니다: ${error.message}`);
    }

    if (!session?.access_token) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
    }

    return session.access_token;
}

async function callEdgeFunction<TResponse = unknown>(
    functionName: string,
    body: Record<string, unknown>
): Promise<TResponse> {
    if (!SUPABASE_URL || !SUPABASE_FUNCTION_KEY) {
        throw new Error('Supabase 환경 변수가 누락되었습니다. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_LEGACY_ANON_KEY를 확인해 주세요.');
    }

    const accessToken = await getCurrentAccessToken();

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_FUNCTION_KEY,
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
    });

    const rawText = await response.text();

    let parsed: EdgeFunctionErrorResponse | TResponse | null = null;
    if (rawText) {
        try {
            parsed = JSON.parse(rawText) as EdgeFunctionErrorResponse | TResponse;
        } catch {
            parsed = null;
        }
    }

    if (!response.ok) {
        const errorBody = (parsed ?? {}) as EdgeFunctionErrorResponse;
        const detail =
            errorBody?.message ||
            errorBody?.error ||
            errorBody?.details ||
            rawText ||
            `${functionName} 호출에 실패했습니다.`;
        throw new Error(detail);
    }

    return (parsed as TResponse) ?? ({} as TResponse);
}

// ============================================================
// 초기화
// ============================================================

async function initAdmin() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            window.location.replace('/index.html');
            return;
        }

        D.adminUserEmail.textContent = user.email ?? user.id;

        const isAdmin = await checkAdminAccess(user.id);

        if (!isAdmin) {
            console.warn('[Admin] 접근 거부: 관리자 권한 없음 (', user.email, ')');
            window.location.replace('/mypage.html');
            return;
        }

        setupAdminListeners();
        await Promise.all([
            loadPayments(),
            loadRefunds()
        ]);

        D.loadingState.classList.add('hidden');
        switchTab('payments');

    } catch (err) {
        console.error('[initAdmin]', err);
        D.loadingState.classList.add('hidden');
        D.accessDeniedState.classList.remove('hidden');
    }
}

// ============================================================
// 탭 전환
// ============================================================

function switchTab(tab: 'payments' | 'refunds') {
    adminState.currentTab = tab;

    D.tabPayments.classList.toggle('hidden', tab !== 'payments');
    D.tabRefunds.classList.toggle('hidden', tab !== 'refunds');

    D.navLinks.forEach(link => {
        const linkTab = link.getAttribute('data-tab');
        link.classList.toggle('active', linkTab === tab);
    });

    if (tab === 'refunds' && adminState.refunds.length === 0) {
        loadRefunds();
    }
}

// ============================================================
// 이벤트 리스너 설정
// ============================================================

function setupAdminListeners() {
    D.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.getAttribute('data-tab') as 'payments' | 'refunds';
            if (tab) switchTab(tab);
        });
    });

    D.btnAdminLogout.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    });

    D.btnRefreshPayments.addEventListener('click', () => {
        adminState.payments = [];
        loadPayments();
    });

    D.btnRefreshRefunds.addEventListener('click', () => {
        adminState.refunds = [];
        loadRefunds();
    });

    D.paymentSearchInput.addEventListener('input', () => {
        adminState.paymentSearch = D.paymentSearchInput.value.trim().toLowerCase();
        renderPaymentsTable();
    });

    D.refundSearchInput.addEventListener('input', () => {
        adminState.refundSearch = D.refundSearchInput.value.trim().toLowerCase();
        renderRefundsTable();
    });

    D.paymentStatusFilters.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.status-filter-btn') as HTMLButtonElement | null;
        if (!btn) return;
        D.paymentStatusFilters.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminState.paymentStatusFilter = btn.dataset.status ?? '';
        renderPaymentsTable();
    });

    D.refundStatusFilters.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.status-filter-btn') as HTMLButtonElement | null;
        if (!btn) return;
        D.refundStatusFilters.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminState.refundStatusFilter = btn.dataset.status ?? '';
        renderRefundsTable();
    });

    D.btnCloseDrawer.addEventListener('click', closeEventDrawer);
    D.drawerOverlay.addEventListener('click', closeEventDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !D.eventDrawer.classList.contains('hidden')) closeEventDrawer();
    });
}

// ============================================================
// 데이터 로드: 결제 내역
// ============================================================

async function loadPayments() {
    D.paymentsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">불러오는 중...</td></tr>';
    D.paymentsEmpty.classList.add('hidden');

    try {
        const { data, error } = await supabase
            .from('payments')
            .select('id, user_id, product_id, order_id, amount, status, pg_provider, pg_tid, paid_at, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        const productIds = [...new Set((data ?? []).map(p => p.product_id).filter(Boolean))] as string[];
        const productMap = new Map<string, string>();

        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from('credit_products')
                .select('id, name')
                .in('id', productIds);

            (products ?? []).forEach((p: any) => productMap.set(p.id, p.name));
        }

        adminState.payments = (data ?? []).map((p: any) => ({
            ...p,
            product_name: p.product_id ? productMap.get(p.product_id) ?? '알 수 없음' : '—',
        }));

        renderPaymentsTable();
        updateSummaryCards();
    } catch (err) {
        console.error('[loadPayments]', err);
        D.paymentsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:rgb(252,165,165)">데이터를 불러오지 못했습니다.</td></tr>';
    }
}

function renderPaymentsTable() {
    const search = adminState.paymentSearch;
    const statusFilter = adminState.paymentStatusFilter;

    const filtered = adminState.payments.filter(p => {
        const matchStatus = !statusFilter || p.status === statusFilter;
        const matchSearch = !search ||
            p.order_id.toLowerCase().includes(search) ||
            (p.product_name ?? '').toLowerCase().includes(search) ||
            (p.user_id ?? '').toLowerCase().includes(search);
        return matchStatus && matchSearch;
    });

    D.paymentsTableBody.innerHTML = '';
    D.paymentsEmpty.classList.toggle('hidden', filtered.length > 0);

    filtered.forEach(payment => {
        const tr = document.createElement('tr');
        tr.className = 'clickable-row';
        tr.title = '클릭하면 이벤트 타임라인을 볼 수 있습니다';

        const paidDate = payment.paid_at
            ? formatDate(payment.paid_at)
            : payment.status === 'pending' ? '처리 중' : '—';

        tr.innerHTML = `
            <td>${getAdminBadge(payment.status)}</td>
            <td>${escHtml(payment.product_name ?? '—')}</td>
            <td class="td-amount">${payment.amount.toLocaleString('ko-KR')}원</td>
            <td class="td-order-id" title="${escHtml(payment.order_id)}">${escHtml(payment.order_id)}</td>
            <td class="td-user" title="${escHtml(payment.user_id)}">${escHtml(payment.user_id.slice(0, 8))}…</td>
            <td class="td-date">${paidDate}</td>
            <td><button class="btn-view-events">📋 타임라인</button></td>
        `;

        tr.addEventListener('click', () => {
            openEventDrawer(payment.id, payment.order_id);
        });

        const evtBtn = tr.querySelector('.btn-view-events') as HTMLButtonElement;
        evtBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEventDrawer(payment.id, payment.order_id);
        });

        D.paymentsTableBody.appendChild(tr);
    });
}

// ============================================================
// 요약 카드 업데이트
// ============================================================

function updateSummaryCards() {
    const payments = adminState.payments;

    const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const formatToYMD = (date: Date) => {
        const match = kstFormatter.format(date).match(/(\d{4})[^\d]+(\d{2})[^\d]+(\d{2})/);
        return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
    };

    const todayKSTString = formatToYMD(new Date());

    const todayPaid = payments.filter(p => {
        if (p.status !== 'paid' || !p.paid_at) return false;
        return formatToYMD(new Date(p.paid_at)) === todayKSTString;
    }).length;

    const refundPending = adminState.refunds.length > 0
        ? adminState.refunds.filter(r => r.request_status === 'requested' || r.request_status === 'approved').length
        : payments.filter(p => p.status === 'refund_requested').length;

    const autoRefunded = payments.filter(p => p.status === 'refunded').length;

    const failed = payments.filter(p =>
        p.status === 'failed' || p.status === 'cancelled'
    ).length;

    if (D.summaryTodayPaid)     D.summaryTodayPaid.textContent     = String(todayPaid);
    if (D.summaryRefundPending) D.summaryRefundPending.textContent = String(refundPending);
    if (D.summaryAutoRefunded)  D.summaryAutoRefunded.textContent  = String(autoRefunded);
    if (D.summaryFailed)        D.summaryFailed.textContent        = String(failed);
}

// ============================================================
// 데이터 로드: 환불 요청
// ============================================================

async function loadRefunds() {
    D.refundsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">불러오는 중...</td></tr>';
    D.refundsEmpty.classList.add('hidden');

    try {
        const { data, error } = await supabase
            .from('refund_requests')
            .select('id, order_id, user_id, cancel_reason, request_status, admin_note, created_at')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            D.refundsTableBody.innerHTML = '';
            if (error.code === '42P01') {
                D.refundsEmpty.textContent = 'refund_requests 테이블이 아직 생성되지 않았습니다. 마이그레이션을 확인해주세요.';
                D.refundsEmpty.classList.remove('hidden');
            } else if (error.code === '42501') {
                D.refundsEmpty.textContent = '접근 권한이 없습니다. 관리자 RLS 정책을 확인해주세요.';
                D.refundsEmpty.classList.remove('hidden');
            } else {
                throw error;
            }
            return;
        }

        adminState.refunds = (data ?? []) as RefundRequest[];
        renderRefundsTable();
        updateSummaryCards();
    } catch (err) {
        console.error('[loadRefunds]', err);
        D.refundsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:rgb(252,165,165)">데이터를 불러오지 못했습니다.</td></tr>';
    }
}

function renderRefundsTable() {
    const search = adminState.refundSearch;
    const statusFilter = adminState.refundStatusFilter;

    const filtered = adminState.refunds.filter(r => {
        const matchStatus = !statusFilter || r.request_status === statusFilter;
        const matchSearch = !search || r.order_id.toLowerCase().includes(search);
        return matchStatus && matchSearch;
    });

    D.refundsTableBody.innerHTML = '';
    D.refundsEmpty.classList.toggle('hidden', filtered.length > 0);

    filtered.forEach(refund => {
        const tr = document.createElement('tr');

        const isAuto = refund.admin_note?.includes('AUTO');
        const autoText = isAuto
            ? '<span class="admin-badge badge-auto-approved">자동 환불 대상</span>'
            : '<span class="admin-badge badge-review">수동 검토 대상</span>';

        const reason = refund.cancel_reason ?? '';

        let actionTd = '<span style="color:var(--text-muted)">—</span>';
        if (refund.request_status === 'requested') {
            actionTd =
                `<button class="admin-btn admin-btn-primary btn-process-refund" data-action="approved" style="padding:4px 8px; font-size:12px; margin-right:4px;">검토 승인</button>` +
                `<button class="admin-btn admin-btn-error btn-process-refund" data-action="rejected" style="padding:4px 8px; font-size:12px;">요청 거절</button>`;
        } else if (refund.request_status === 'approved') {
            actionTd = `<button class="admin-btn btn-execute-refund" style="background: rgb(16,185,129); color: #fff; padding:4px 8px; font-size:12px;">환불 실행</button>`;
        }

        tr.innerHTML = `
            <td>${getRefundBadge(refund.request_status)}</td>
            <td class="td-order-id" title="${escHtml(refund.order_id)}">${escHtml(refund.order_id)}</td>
            <td class="td-reason" title="${escHtml(reason)}">${escHtml(reason) || '<span style="color:var(--text-muted)">사유 없음</span>'}</td>
            <td>${autoText}</td>
            <td class="td-date">${formatDate(refund.created_at)}</td>
            <td class="td-date" title="${escHtml(refund.admin_note)}">${escHtml(refund.admin_note) || '—'}</td>
            <td>${actionTd}</td>
        `;

        if (refund.request_status === 'requested') {
            const btns = tr.querySelectorAll('.btn-process-refund');
            btns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const action = (btn as HTMLButtonElement).dataset.action;
                    if (!action) return;
                    await processRefund(refund.id, action as 'approved' | 'rejected', btn as HTMLButtonElement);
                });
            });
        } else if (refund.request_status === 'approved') {
            const execBtn = tr.querySelector('.btn-execute-refund') as HTMLButtonElement;
            if (execBtn) {
                execBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await executeRefund(refund.id, refund.order_id, reason, execBtn);
                });
            }
        }

        D.refundsTableBody.appendChild(tr);
    });
}

async function processRefund(refundId: string, action: 'approved' | 'rejected', btnEl: HTMLButtonElement) {
    const actionText = action === 'approved' ? '검토 승인' : '요청 거절';
    if (!confirm(`정말 ${actionText}하시겠습니까?`)) return;

    const allBtns = btnEl.parentElement?.querySelectorAll('button');
    allBtns?.forEach(b => (b.disabled = true));

    const originalText = btnEl.textContent;
    btnEl.textContent = '처리 중...';

    try {
        const { error } = await supabase
            .from('refund_requests')
            .update({ request_status: action })
            .eq('id', refundId);

        if (error) throw error;

        await loadRefunds();
    } catch (err: any) {
        console.error('[processRefund]', err);
        alert(`${actionText} 처리 중 오류가 발생했습니다: ${err.message}`);

        allBtns?.forEach(b => (b.disabled = false));
        btnEl.textContent = originalText ?? actionText;
    }
}

async function executeRefund(refundId: string, orderId: string, cancelReason: string, btnEl: HTMLButtonElement) {
    if (!confirm('정말 환불을 실행하시겠습니까?')) return;

    const originalText = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '처리 중...';

    try {
        const fnData = await callEdgeFunction<CancelPaymentSuccessResponse>('cancel-payment', {
            refundRequestId: refundId,
            orderId,
            cancelReason: cancelReason || '관리자의 환불 실행',
        });

        if (!fnData?.success) {
            throw new Error(fnData?.message || fnData?.error || 'Edge Function에서 환불 처리에 실패했습니다.');
        }

        alert(fnData?.message || '환불이 성공적으로 실행되었습니다.');

        await Promise.all([
            loadPayments(),
            loadRefunds()
        ]);
    } catch (err: any) {
        console.error('[executeRefund]', err);
        alert(`환불 실행 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`);
        btnEl.disabled = false;
        btnEl.textContent = originalText ?? '환불 실행';
    }
}

// ============================================================
// 이벤트 타임라인 드로어
// ============================================================

async function openEventDrawer(paymentId: string, orderId: string) {
    D.drawerOrderId.textContent = orderId;
    D.eventTimeline.innerHTML = '<div style="color:var(--text-muted);padding:16px 0">불러오는 중...</div>';
    D.eventTimelineEmpty.classList.add('hidden');

    D.eventDrawer.classList.remove('hidden');
    D.drawerOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
        const { data, error } = await supabase
            .from('payment_events')
            .select('id, payment_id, event_type, payload, created_at')
            .eq('payment_id', paymentId)
            .order('created_at', { ascending: true });

        if (error) {
            if (error.code === '42P01') {
                D.eventTimeline.innerHTML = '';
                D.eventTimelineEmpty.textContent = 'payment_events 테이블이 아직 생성되지 않았습니다.';
                D.eventTimelineEmpty.classList.remove('hidden');
                return;
            }
            throw error;
        }

        const events = (data ?? []) as PaymentEvent[];
        renderTimeline(events);
    } catch (err) {
        console.error('[openEventDrawer]', err);
        D.eventTimeline.innerHTML = '<div style="color:rgb(252,165,165);padding:8px 0">이벤트를 불러오지 못했습니다.</div>';
    }
}

function renderTimeline(events: PaymentEvent[]) {
    D.eventTimeline.innerHTML = '';
    D.eventTimelineEmpty.classList.toggle('hidden', events.length > 0);

    if (events.length === 0) return;

    events.forEach(evt => {
        const dotClass = getTimelineDotClass(evt.event_type);
        const icon = getTimelineIcon(evt.event_type);

        const item = document.createElement('div');
        item.className = 'timeline-item';

        const metaStr = evt.payload
            ? JSON.stringify(evt.payload, null, 2)
            : null;

        item.innerHTML = `
            <div class="timeline-dot ${dotClass}">${icon}</div>
            <div class="timeline-content">
                <div class="timeline-event-type">${escHtml(evt.event_type)}</div>
                <div class="timeline-event-date">${formatDate(evt.created_at)}</div>
                ${metaStr ? `<pre class="timeline-event-meta">${escHtml(metaStr)}</pre>` : ''}
            </div>
        `;

        D.eventTimeline.appendChild(item);
    });
}

function closeEventDrawer() {
    D.eventDrawer.classList.add('hidden');
    D.drawerOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

// ============================================================
// 헬퍼
// ============================================================

function getAdminBadge(status: string): string {
    const map: Record<string, [string, string]> = {
        paid:             ['badge-paid',             '● 결제 완료'],
        pending:          ['badge-pending',          '○ 처리 중'],
        refunded:         ['badge-refunded',         '◆ 환불 완료'],
        refund_requested: ['badge-refund-requested', '▲ 환불 요청'],
        failed:           ['badge-failed',           '✕ 실패'],
        cancelled:        ['badge-cancelled',        '— 취소'],
    };
    const [cls, label] = map[status] ?? ['badge-cancelled', status];
    return `<span class="admin-badge ${cls}">${label}</span>`;
}

function getRefundBadge(status: string): string {
    const map: Record<string, [string, string]> = {
        requested:     ['badge-review',        '⏳ 검토 대기'],
        approved:      ['badge-auto-approved', '✅ 승인 대기'],
        completed:     ['badge-refunded',      '◆ 환불 완료'],
        rejected:      ['badge-failed',        '✕ 거절됨'],
    };
    const [cls, label] = map[status] ?? ['badge-cancelled', status];
    return `<span class="admin-badge ${cls}">${label}</span>`;
}

function getTimelineDotClass(eventType: string): string {
    if (/paid|success|complet/i.test(eventType)) return 'dot-success';
    if (/fail|error|reject/i.test(eventType)) return 'dot-error';
    if (/refund|cancel/i.test(eventType)) return 'dot-warning';
    return 'dot-info';
}

function getTimelineIcon(eventType: string): string {
    if (/paid|success/i.test(eventType)) return '✓';
    if (/fail|error/i.test(eventType)) return '✕';
    if (/refund/i.test(eventType)) return '↩';
    if (/cancel/i.test(eventType)) return '○';
    return '·';
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function escHtml(str: string | null | undefined): string {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================================
// 시작
// ============================================================

document.addEventListener('DOMContentLoaded', initAdmin);