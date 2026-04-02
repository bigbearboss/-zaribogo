import { supabase } from './services/supabase';

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
  is_auto: boolean | null;
}

interface PaymentEvent {
  id: string;
  payment_id: string;
  event_type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}

interface AdminActionLog {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  order_id: string | null;
  detail_json: Record<string, unknown> | null;
  created_at: string;
}

interface EdgeFunctionErrorResponse {
  code?: number | string;
  message?: string;
  error?: string;
  details?: string;
  detail?: string;
  success?: boolean;
}

interface CancelPaymentSuccessResponse {
  success?: boolean;
  message?: string;
  error?: string;
  details?: string;
  detail?: string;
  [key: string]: unknown;
}

interface UpdateRefundRequestSuccessResponse {
  success?: boolean;
  message?: string;
  error?: string;
  details?: string;
  detail?: string;
  data?: RefundRequest;
  [key: string]: unknown;
}

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

const adminState = {
  currentTab: 'payments' as 'payments' | 'refunds',
  payments: [] as AdminPayment[],
  refunds: [] as RefundRequest[],
  paymentStatusFilter: '',
  refundStatusFilter: '',
  paymentSearch: '',
  refundSearch: '',
  processingRefundIds: new Set<string>(),
};

const D = {
  app: document.getElementById('admin-app') as HTMLElement,
  loadingState: document.getElementById('adminLoadingState') as HTMLElement,
  accessDeniedState: document.getElementById('accessDeniedState') as HTMLElement,
  adminUserEmail: document.getElementById('adminUserEmail') as HTMLElement,
  btnAdminLogout: document.getElementById('btnAdminLogout') as HTMLButtonElement,
  navLinks: document.querySelectorAll('.admin-nav-link'),

  tabPayments: document.getElementById('tab-payments') as HTMLElement,
  btnRefreshPayments: document.getElementById('btnRefreshPayments') as HTMLButtonElement,
  paymentSearchInput: document.getElementById('paymentSearchInput') as HTMLInputElement,
  paymentStatusFilters: document.getElementById('paymentStatusFilters') as HTMLElement,
  paymentsTableBody: document.getElementById('paymentsTableBody') as HTMLElement,
  paymentsEmpty: document.getElementById('paymentsEmpty') as HTMLElement,

  tabRefunds: document.getElementById('tab-refunds') as HTMLElement,
  btnRefreshRefunds: document.getElementById('btnRefreshRefunds') as HTMLButtonElement,
  refundSearchInput: document.getElementById('refundSearchInput') as HTMLInputElement,
  refundStatusFilters: document.getElementById('refundStatusFilters') as HTMLElement,
  refundsTableBody: document.getElementById('refundsTableBody') as HTMLElement,
  refundsEmpty: document.getElementById('refundsEmpty') as HTMLElement,

  eventDrawer: document.getElementById('eventDrawer') as HTMLElement,
  drawerOverlay: document.getElementById('drawerOverlay') as HTMLElement,
  btnCloseDrawer: document.getElementById('btnCloseDrawer') as HTMLButtonElement,
  drawerTitle: document.getElementById('drawerTitle') as HTMLElement,
  drawerOrderId: document.getElementById('drawerOrderId') as HTMLElement,
  eventTimeline: document.getElementById('eventTimeline') as HTMLElement,
  eventTimelineEmpty: document.getElementById('eventTimelineEmpty') as HTMLElement,

  summaryTodayPaid: document.getElementById('summaryTodayPaid') as HTMLElement,
  summaryRefundPending: document.getElementById('summaryRefundPending') as HTMLElement,
  summaryAutoRefunded: document.getElementById('summaryAutoRefunded') as HTMLElement,
  summaryFailed: document.getElementById('summaryFailed') as HTMLElement,
};

async function getFreshAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    throw new Error(`세션 갱신 실패: ${error.message}`);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('로그인 세션이 유효하지 않습니다. 다시 로그인해 주세요.');
  }

  return accessToken;
}

async function callEdgeFunction<TResponse = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const accessToken = await getFreshAccessToken();

  supabase.functions.setAuth(accessToken);

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  const parsed = (data ?? {}) as EdgeFunctionErrorResponse & TResponse;

  if (error) {
    let detail =
      parsed?.message ||
      parsed?.error ||
      parsed?.detail ||
      parsed?.details ||
      error.message ||
      `${functionName} 호출에 실패했습니다.`;

    const errorAny = error as any;
    if (errorAny?.context && typeof errorAny.context.json === 'function') {
      try {
        const errJson = await errorAny.context.json();
        detail =
          errJson?.message ||
          errJson?.error ||
          errJson?.detail ||
          errJson?.details ||
          detail;
      } catch {
        // ignore
      }
    }

    throw new Error(detail);
  }

  return parsed as TResponse;
}

async function initAdmin() {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      window.location.replace('/index.html');
      return;
    }

    D.adminUserEmail.textContent = user.email ?? user.id;

    const isAdmin = await checkAdminAccess(user.id);

    if (!isAdmin) {
      window.location.replace('/mypage.html');
      return;
    }

    setupAdminListeners();
    await Promise.all([loadPayments(), loadRefunds()]);

    D.loadingState.classList.add('hidden');
    switchTab('payments');
  } catch (err) {
    console.error('[initAdmin]', err);
    D.loadingState.classList.add('hidden');
    D.accessDeniedState.classList.remove('hidden');
  }
}

function switchTab(tab: 'payments' | 'refunds') {
  adminState.currentTab = tab;

  D.tabPayments.classList.toggle('hidden', tab !== 'payments');
  D.tabRefunds.classList.toggle('hidden', tab !== 'refunds');

  D.navLinks.forEach((link) => {
    const linkTab = link.getAttribute('data-tab');
    link.classList.toggle('active', linkTab === tab);
  });

  if (tab === 'refunds' && adminState.refunds.length === 0) {
    loadRefunds();
  }
}

function setupAdminListeners() {
  D.navLinks.forEach((link) => {
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
    D.paymentStatusFilters.querySelectorAll('.status-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    adminState.paymentStatusFilter = btn.dataset.status ?? '';
    renderPaymentsTable();
  });

  D.refundStatusFilters.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.status-filter-btn') as HTMLButtonElement | null;
    if (!btn) return;
    D.refundStatusFilters.querySelectorAll('.status-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    adminState.refundStatusFilter = btn.dataset.status ?? '';
    renderRefundsTable();
  });

  D.btnCloseDrawer.addEventListener('click', closeEventDrawer);
  D.drawerOverlay.addEventListener('click', closeEventDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !D.eventDrawer.classList.contains('hidden')) {
      closeEventDrawer();
    }
  });
}

async function loadPayments() {
  D.paymentsTableBody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">불러오는 중...</td></tr>';
  D.paymentsEmpty.classList.add('hidden');

  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, user_id, product_id, order_id, amount, status, pg_provider, pg_tid, paid_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    const productIds = [...new Set((data ?? []).map((p: any) => p.product_id).filter(Boolean))] as string[];
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
    D.paymentsTableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:rgb(252,165,165)">데이터를 불러오지 못했습니다.</td></tr>';
  }
}

function renderPaymentsTable() {
  const search = adminState.paymentSearch;
  const statusFilter = adminState.paymentStatusFilter;

  const filtered = adminState.payments.filter((p: AdminPayment) => {
    const matchStatus = !statusFilter || p.status === statusFilter;
    const matchSearch =
      !search ||
      p.order_id.toLowerCase().includes(search) ||
      (p.product_name ?? '').toLowerCase().includes(search) ||
      (p.user_id ?? '').toLowerCase().includes(search);
    return matchStatus && matchSearch;
  });

  D.paymentsTableBody.innerHTML = '';
  D.paymentsEmpty.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach((payment: AdminPayment) => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.title = '클릭하면 이벤트 타임라인을 볼 수 있습니다';

    const paidDate = payment.paid_at
      ? formatDate(payment.paid_at)
      : payment.status === 'pending'
        ? '처리 중'
        : '—';

    tr.innerHTML = `
      <td>${getAdminBadge(payment.status)}</td>
      <td>${escHtml(payment.product_name ?? '—')}</td>
      <td class="td-amount">${payment.amount.toLocaleString('ko-KR')}원</td>
      <td class="td-order-id" title="${escHtml(payment.order_id)}">${escHtml(payment.order_id)}</td>
      <td class="td-user" title="${escHtml(payment.user_id)}">${escHtml(payment.user_id.slice(0, 8))}…</td>
      <td class="td-date">${paidDate}</td>
      <td><button class="btn-view-events">📋 타임라인</button></td>
    `;

    tr.addEventListener('click', () => openEventDrawer('payment', payment.id, payment.order_id));

    const evtBtn = tr.querySelector('.btn-view-events') as HTMLButtonElement;
    evtBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEventDrawer('payment', payment.id, payment.order_id);
    });

    D.paymentsTableBody.appendChild(tr);
  });
}

function updateSummaryCards() {
  const payments = adminState.payments;

  const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const formatToYMD = (date: Date) => {
    const match = kstFormatter.format(date).match(/(\d{4})[^\d]+(\d{2})[^\d]+(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  };

  const todayKSTString = formatToYMD(new Date());

  const todayPaid = payments.filter((p: AdminPayment) => {
    if (p.status !== 'paid' || !p.paid_at) return false;
    return formatToYMD(new Date(p.paid_at)) === todayKSTString;
  }).length;

  const refundPending =
    adminState.refunds.length > 0
      ? adminState.refunds.filter((r: RefundRequest) => r.request_status === 'requested' || r.request_status === 'approved').length
      : payments.filter((p: AdminPayment) => p.status === 'refund_requested').length;

  const autoRefunded = payments.filter((p: AdminPayment) => p.status === 'refunded').length;
  const failed = payments.filter((p: AdminPayment) => p.status === 'failed' || p.status === 'cancelled').length;

  if (D.summaryTodayPaid) D.summaryTodayPaid.textContent = String(todayPaid);
  if (D.summaryRefundPending) D.summaryRefundPending.textContent = String(refundPending);
  if (D.summaryAutoRefunded) D.summaryAutoRefunded.textContent = String(autoRefunded);
  if (D.summaryFailed) D.summaryFailed.textContent = String(failed);
}

async function loadRefunds() {
  D.refundsTableBody.innerHTML =
    '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">불러오는 중...</td></tr>';
  D.refundsEmpty.classList.add('hidden');

  try {
    const { data, error } = await supabase
      .from('refund_requests')
      .select('id, order_id, user_id, cancel_reason, request_status, admin_note, created_at, is_auto')
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
    D.refundsTableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:rgb(252,165,165)">데이터를 불러오지 못했습니다.</td></tr>';
  }
}

function renderRefundsTable() {
  const search = adminState.refundSearch;
  const statusFilter = adminState.refundStatusFilter;

  const filtered = adminState.refunds.filter((r: RefundRequest) => {
    const matchStatus = !statusFilter || r.request_status === statusFilter;
    const matchSearch = !search || r.order_id.toLowerCase().includes(search);
    return matchStatus && matchSearch;
  });

  D.refundsTableBody.innerHTML = '';
  D.refundsEmpty.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach((refund: RefundRequest) => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.title = '클릭하면 처리 히스토리를 볼 수 있습니다';

    const isAuto = refund.is_auto === true;
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
      <td><button class="btn-view-events" style="padding:4px 8px;">📋 내역</button></td>
      <td>${actionTd}</td>
    `;

    tr.addEventListener('click', () => openEventDrawer('refund', refund.id, refund.order_id));

    const histBtn = tr.querySelector('.btn-view-events') as HTMLButtonElement | null;
    if (histBtn) {
        histBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEventDrawer('refund', refund.id, refund.order_id);
        });
    }

    if (refund.request_status === 'requested') {
      const btns = tr.querySelectorAll('.btn-process-refund');
      btns.forEach((btn) => {
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
  if (adminState.processingRefundIds.has(refundId)) return;

  const actionText = action === 'approved' ? '검토 승인' : '요청 거절';
  if (!confirm(`정말 ${actionText}하시겠습니까?`)) return;

  adminState.processingRefundIds.add(refundId);

  const allBtns = btnEl.parentElement?.querySelectorAll('button');
  allBtns?.forEach((b) => {
    (b as HTMLButtonElement).disabled = true;
  });

  const originalText = btnEl.textContent;
  btnEl.textContent = '처리 중...';

  try {
    const fnData = await callEdgeFunction<UpdateRefundRequestSuccessResponse>('admin-update-refund-request', {
      refundRequestId: refundId,
      action,
    });

    if (!fnData?.success) {
      throw new Error(
        fnData?.message ||
          fnData?.error ||
          fnData?.detail ||
          fnData?.details ||
          `${actionText} 처리에 실패했습니다.`
      );
    }

    alert(fnData?.message || `${actionText} 완료`);
    await loadRefunds();
  } catch (err: any) {
    console.error('[processRefund]', err);
    alert(`${actionText} 처리 중 오류가 발생했습니다: ${err.message}`);

    allBtns?.forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
    });
       btnEl.textContent = originalText ?? actionText;
  } finally {
    adminState.processingRefundIds.delete(refundId);
  }
}

async function executeRefund(refundId: string, orderId: string, cancelReason: string, btnEl: HTMLButtonElement) {
  if (adminState.processingRefundIds.has(refundId)) return;
  if (!confirm('정말 환불을 실행하시겠습니까?')) return;

  adminState.processingRefundIds.add(refundId);

  const originalText = btnEl.textContent;
  const parent = btnEl.parentElement;

  parent?.querySelectorAll('button').forEach((b) => {
    (b as HTMLButtonElement).disabled = true;
  });

  btnEl.textContent = '처리 중...';

  try {
    const fnData = await callEdgeFunction<CancelPaymentSuccessResponse>('cancel-payment', {
      refundRequestId: refundId,
      orderId,
      cancelReason: cancelReason || '관리자의 환불 실행',
    });

    const message =
      fnData?.message ||
      fnData?.error ||
      fnData?.detail ||
      fnData?.details ||
      '';

    const isAlreadyCancelled =
      message.includes('already') ||
      message.includes('이미') ||
      message.includes('cancelled');

    if (!fnData?.success && !isAlreadyCancelled) {
      throw new Error(message || '환불 처리 실패');
    }


    alert(
      isAlreadyCancelled
        ? '이미 취소된 결제 건으로 확인되어 내부 상태를 완료로 동기화했습니다.'
        : fnData?.message || '환불이 성공적으로 실행되었습니다.'
    );

    await Promise.all([loadPayments(), loadRefunds()]);
  } catch (err: any) {
    console.error('[executeRefund]', err);

    alert(
      err.message?.includes('constraint')
        ? '환불 상태 처리 중 오류가 발생했습니다. 관리자에게 문의하세요.'
        : `환불 실행 실패: ${err.message || '알 수 없는 오류'}`
    );

    parent?.querySelectorAll('button').forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
    });

    btnEl.textContent = originalText ?? '환불 실행';
  } finally {
    adminState.processingRefundIds.delete(refundId);
  }
}

async function openEventDrawer(type: 'payment' | 'refund', targetId: string, referenceId: string) {
  if (D.drawerTitle) {
    D.drawerTitle.textContent = type === 'payment' ? '결제 이벤트 타임라인' : '환불 처리 히스토리';
  }
  D.drawerOrderId.textContent = referenceId;
  D.eventTimeline.innerHTML = '<div style="color:var(--text-muted);padding:16px 0">불러오는 중...</div>';
  D.eventTimelineEmpty.classList.add('hidden');

  D.eventDrawer.classList.remove('hidden');
  D.drawerOverlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    if (type === 'payment') {
      const { data, error } = await supabase
        .from('payment_events')
        .select('id, payment_id, event_type, payload_json, created_at')
        .eq('payment_id', targetId)
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
      renderTimeline(data ?? [], false);
    } else {
      const { data, error } = await supabase
        .from('admin_action_logs')
        .select('id, admin_user_id, action_type, detail_json, created_at')
        .eq('target_type', 'refund_request')
        .eq('target_id', targetId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          D.eventTimeline.innerHTML = '';
          D.eventTimelineEmpty.textContent = 'admin_action_logs 테이블이 없습니다.';
          D.eventTimelineEmpty.classList.remove('hidden');
          return;
        }
        throw error;
      }
      renderTimeline(data ?? [], true);
    }
  } catch (err: any) {
    console.error('[openEventDrawer]', err);
    const message = err?.message || '기록을 불러오지 못했습니다.';
    D.eventTimeline.innerHTML = `<div style="color:rgb(252,165,165);padding:8px 0">${escHtml(message)}</div>`;
  }
}

function getActionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    'refund_request_approved': '검토 승인',
    'refund_request_rejected': '요청 거절',
    'refund_executed': '환불 실행',
    'refund_synced_already_cancelled': '결제사 취소 동기화 완료',
  };
  return map[type] || type;
}

function renderTimeline(events: any[], isActionLog: boolean) {
  D.eventTimeline.innerHTML = '';
  D.eventTimelineEmpty.classList.toggle('hidden', events.length === 0);

  if (events.length === 0) return;

  events.forEach((evt: any) => {
    const rawType = isActionLog ? evt.action_type : evt.event_type;
    const mappedType = isActionLog ? getActionTypeLabel(rawType) : rawType;
    const dotClass = getTimelineDotClass(rawType);
    const icon = getTimelineIcon(rawType);

    const payload = isActionLog ? evt.detail_json : evt.payload_json;
    const metaStr = payload ? JSON.stringify(payload, null, 2) : null;

    const adminUserStr =
      isActionLog && evt.admin_user_id
        ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">관리자 ID: ${escHtml(evt.admin_user_id)}</div>`
        : '';

    const item = document.createElement('div');
    item.className = 'timeline-item';

    item.innerHTML = `
      <div class="timeline-dot ${dotClass}">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-event-type">${escHtml(mappedType)}</div>
        ${adminUserStr}
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

function getAdminBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    paid: ['badge-paid', '● 결제 완료'],
    pending: ['badge-pending', '○ 처리 중'],
    refunded: ['badge-refunded', '◆ 환불 완료'],
    refund_requested: ['badge-refund-requested', '▲ 환불 요청'],
    failed: ['badge-failed', '✕ 실패'],
    cancelled: ['badge-cancelled', '— 취소'],
  };
  const [cls, label] = map[status] ?? ['badge-cancelled', status];
  return `<span class="admin-badge ${cls}">${label}</span>`;
}

function getRefundBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    requested: ['badge-review', '⏳ 검토 대기'],
    approved: ['badge-auto-approved', '🟡 환불 실행 대기'],
    completed: ['badge-refunded', '◆ 환불 완료'],
    rejected: ['badge-failed', '✕ 거절됨'],
  };
  const [cls, label] = map[status] ?? ['badge-cancelled', status];
  return `<span class="admin-badge ${cls}">${label}</span>`;
}

function getTimelineDotClass(eventType: string): string {
  if (/paid|success|complet|approved/i.test(eventType)) return 'dot-success';
  if (/fail|error|reject/i.test(eventType)) return 'dot-error';
  if (/refund|cancel/i.test(eventType)) return 'dot-warning';
  return 'dot-info';
}

function getTimelineIcon(eventType: string): string {
  if (/paid|success/i.test(eventType)) return '✓';
  if (/approved/i.test(eventType)) return '●';
  if (/fail|error|reject/i.test(eventType)) return '✕';
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

document.addEventListener('DOMContentLoaded', initAdmin);
