import { supabase } from './services/supabase';

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
    // 조인 결과
    user_email?: string;
    product_name?: string;
}

interface RefundRequest {
    id: string;
    order_id: string;
    user_id: string;
    cancel_reason: string;
    status: string; // 'pending' | 'auto_approved' | 'approved' | 'rejected'
    auto_refund_eligible: boolean | null;
    created_at: string;
    processed_at: string | null;
}

interface PaymentEvent {
    id: string;
    payment_id: string;
    event_type: string;
    payload: Record<string, unknown> | null;
    created_at: string;
}

// ============================================================
// 관리자 권한 체크 (나중에 실제 체크로 교체)
// ============================================================

/**
 * 관리자 권한 체크: profiles.is_admin = true 여부를 Supabase에서 직접 조회합니다.
 *
 * RLS 정책 전제:
 *   - profiles 테이블에 "Users can view own profile" 정책이 있어야 합니다. (기존 정책 유지)
 *   - is_admin 컬럼이 profiles 테이블에 존재해야 합니다.
 *     → supabase/migrations/20260401131316_add_admin_flag.sql 을 먼저 실행하세요.
 *
 * 관리자 지정 방법 (Supabase SQL Editor):
 *   UPDATE public.profiles SET is_admin = true WHERE email = 'admin@example.com';
 */
async function checkAdminAccess(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', userId)
            .single();

        if (error) {
            // is_admin 컬럼이 없거나 네트워크 오류 → 접근 거부
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

    // 결제 탭
    tabPayments:        document.getElementById('tab-payments') as HTMLElement,
    btnRefreshPayments: document.getElementById('btnRefreshPayments') as HTMLButtonElement,
    paymentSearchInput: document.getElementById('paymentSearchInput') as HTMLInputElement,
    paymentStatusFilters: document.getElementById('paymentStatusFilters') as HTMLElement,
    paymentsTableBody:  document.getElementById('paymentsTableBody') as HTMLElement,
    paymentsEmpty:      document.getElementById('paymentsEmpty') as HTMLElement,

    // 환불 탭
    tabRefunds:         document.getElementById('tab-refunds') as HTMLElement,
    btnRefreshRefunds:  document.getElementById('btnRefreshRefunds') as HTMLButtonElement,
    refundSearchInput:  document.getElementById('refundSearchInput') as HTMLInputElement,
    refundStatusFilters: document.getElementById('refundStatusFilters') as HTMLElement,
    refundsTableBody:   document.getElementById('refundsTableBody') as HTMLElement,
    refundsEmpty:       document.getElementById('refundsEmpty') as HTMLElement,

    // 드로어
    eventDrawer:        document.getElementById('eventDrawer') as HTMLElement,
    drawerOverlay:      document.getElementById('drawerOverlay') as HTMLElement,
    btnCloseDrawer:     document.getElementById('btnCloseDrawer') as HTMLButtonElement,
    drawerOrderId:      document.getElementById('drawerOrderId') as HTMLElement,
    eventTimeline:      document.getElementById('eventTimeline') as HTMLElement,
    eventTimelineEmpty: document.getElementById('eventTimelineEmpty') as HTMLElement,

    // 요약 카드
    summaryTodayPaid:    document.getElementById('summaryTodayPaid') as HTMLElement,
    summaryRefundPending: document.getElementById('summaryRefundPending') as HTMLElement,
    summaryAutoRefunded: document.getElementById('summaryAutoRefunded') as HTMLElement,
    summaryFailed:       document.getElementById('summaryFailed') as HTMLElement,
};

// ============================================================
// 초기화
// ============================================================

async function initAdmin() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();

        // ① 비로그인 → 메인 랜딩으로
        if (error || !user) {
            window.location.replace('/index.html');
            return;
        }

        D.adminUserEmail.textContent = user.email ?? user.id;

        const isAdmin = await checkAdminAccess(user.id);

        // ② 로그인은 됐지만 관리자가 아님 → 마이페이지로
        if (!isAdmin) {
            console.warn('[Admin] 접근 거부: 관리자 권한 없음 (', user.email, ')');
            window.location.replace('/mypage.html');
            return;
        }

        // ③ 관리자 확인 → 정상 진입
        setupAdminListeners();
        await loadPayments();

        D.loadingState.classList.add('hidden');
        switchTab('payments');

    } catch (err) {
        console.error('[initAdmin]', err);
        // 예외 시에도 안전하게 차단
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
    // 탭 nav
    D.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.getAttribute('data-tab') as 'payments' | 'refunds';
            if (tab) switchTab(tab);
        });
    });

    // 로그아웃
    D.btnAdminLogout.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    });

    // 결제 새로고침
    D.btnRefreshPayments.addEventListener('click', () => {
        adminState.payments = [];
        loadPayments();
    });

    // 환불 새로고침 — 캐시 초기화 후 강제 재조회
    D.btnRefreshRefunds.addEventListener('click', () => {
        adminState.refunds = [];
        loadRefunds();
    });

    // 결제 검색
    D.paymentSearchInput.addEventListener('input', () => {
        adminState.paymentSearch = D.paymentSearchInput.value.trim().toLowerCase();
        renderPaymentsTable();
    });

    // 환불 검색
    D.refundSearchInput.addEventListener('input', () => {
        adminState.refundSearch = D.refundSearchInput.value.trim().toLowerCase();
        renderRefundsTable();
    });

    // 결제 상태 필터
    D.paymentStatusFilters.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.status-filter-btn') as HTMLButtonElement | null;
        if (!btn) return;
        D.paymentStatusFilters.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminState.paymentStatusFilter = btn.dataset.status ?? '';
        renderPaymentsTable();
    });

    // 환불 상태 필터
    D.refundStatusFilters.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('.status-filter-btn') as HTMLButtonElement | null;
        if (!btn) return;
        D.refundStatusFilters.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        adminState.refundStatusFilter = btn.dataset.status ?? '';
        renderRefundsTable();
    });

    // 드로어 닫기
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
        // payments 조회 (서비스롤 필요 → 현재는 RLS로 자신 것만, 관리자 RLS 정책 추가 시 전체 조회 가능)
        const { data, error } = await supabase
            .from('payments')
            .select('id, user_id, product_id, order_id, amount, status, pg_provider, pg_tid, paid_at, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        // product 이름 보강
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

        // 행 전체 클릭 → 드로어 열기
        tr.addEventListener('click', () => {
            openEventDrawer(payment.id, payment.order_id);
        });

        // 타임라인 버튼도 동일 동작 (이벤트 버블 방지 불필요)
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

    // 오늘 날짜 기준 (로컬 00:00:00)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // ── 오늘 결제 건수: paid이고 paid_at이 오늘인 것
    const todayPaid = payments.filter(p => {
        if (p.status !== 'paid' || !p.paid_at) return false;
        return new Date(p.paid_at) >= todayStart;
    }).length;

    // ── 환불 요청 대기: refund_requests 데이터 우선, 없으면 payments 기반
    const refundPending = adminState.refunds.length > 0
        ? adminState.refunds.filter(r => r.status === 'pending').length
        : payments.filter(p => p.status === 'refund_requested').length;

    // ── 자동 환불 완료: refund_requests 데이터 우선, 없으면 payments.refunded 기반
    const autoRefunded = adminState.refunds.length > 0
        ? adminState.refunds.filter(r => r.status === 'auto_approved').length
        : payments.filter(p => p.status === 'refunded').length;

    // ── 실패/취소: status가 failed 또는 cancelled
    const failed = payments.filter(p =>
        p.status === 'failed' || p.status === 'cancelled'
    ).length;

    if (D.summaryTodayPaid)    D.summaryTodayPaid.textContent    = String(todayPaid);
    if (D.summaryRefundPending) D.summaryRefundPending.textContent = String(refundPending);
    if (D.summaryAutoRefunded) D.summaryAutoRefunded.textContent  = String(autoRefunded);
    if (D.summaryFailed)       D.summaryFailed.textContent        = String(failed);
}

// ============================================================
// 데이터 로드: 환불 요청
// ============================================================

async function loadRefunds() {
    D.refundsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">불러오는 중...</td></tr>';
    D.refundsEmpty.classList.add('hidden');

    try {
        // refund_requests 테이블이 없으면 gracefully 처리
        const { data, error } = await supabase
            .from('refund_requests')
            .select('id, order_id, user_id, cancel_reason, status, auto_refund_eligible, created_at, processed_at')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            D.refundsTableBody.innerHTML = '';
            if (error.code === '42P01') {
                // 테이블 미존재
                D.refundsEmpty.textContent = 'refund_requests 테이블이 아직 생성되지 않았습니다. 마이그레이션을 확인해주세요.';
                D.refundsEmpty.classList.remove('hidden');
            } else if (error.code === '42501') {
                // RLS 차단
                D.refundsEmpty.textContent = '접근 권한이 없습니다. 관리자 RLS 정책을 확인해주세요.';
                D.refundsEmpty.classList.remove('hidden');
            } else {
                throw error;
            }
            return;
        }

        adminState.refunds = (data ?? []) as RefundRequest[];
        renderRefundsTable();
    } catch (err) {
        console.error('[loadRefunds]', err);
        D.refundsTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:rgb(252,165,165)">데이터를 불러오지 못했습니다.</td></tr>';
    }
}

function renderRefundsTable() {
    const search = adminState.refundSearch;
    const statusFilter = adminState.refundStatusFilter;

    const filtered = adminState.refunds.filter(r => {
        const matchStatus = !statusFilter || r.status === statusFilter;
        const matchSearch = !search || r.order_id.toLowerCase().includes(search);
        return matchStatus && matchSearch;
    });

    D.refundsTableBody.innerHTML = '';
    D.refundsEmpty.classList.toggle('hidden', filtered.length > 0);

    filtered.forEach(refund => {
        const tr = document.createElement('tr');

        const autoText = refund.auto_refund_eligible === true
            ? '<span class="admin-badge badge-auto-approved">자동 처리</span>'
            : refund.auto_refund_eligible === false
            ? '<span class="admin-badge badge-review">검토 필요</span>'
            : '—';

        // cancel_reason이 null일 수 있음
        const reason = refund.cancel_reason ?? '';

        tr.innerHTML = `
            <td>${getRefundBadge(refund.status)}</td>
            <td class="td-order-id" title="${escHtml(refund.order_id)}">${escHtml(refund.order_id)}</td>
            <td class="td-reason" title="${escHtml(reason)}">${escHtml(reason) || '<span style="color:var(--text-muted)">사유 없음</span>'}</td>
            <td>${autoText}</td>
            <td class="td-date">${formatDate(refund.created_at)}</td>
            <td class="td-date">${refund.processed_at ? formatDate(refund.processed_at) : '—'}</td>
        `;

        D.refundsTableBody.appendChild(tr);
    });
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
        // payment_events 테이블이 없으면 gracefully 처리
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
        pending:       ['badge-review',        '⏳ 검토 대기'],
        auto_approved: ['badge-auto-approved', '✅ 자동 승인'],
        approved:      ['badge-approved',      '✔ 승인됨'],
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
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
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
