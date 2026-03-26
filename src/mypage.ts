import { supabase } from './services/supabase';
import { authService } from './services/AuthService';

// ==========================================
// 1. State Management
// ==========================================
interface AppState {
    user: any;
    profile: any;
    credits: any;
    recentReports: any[];
    allReports: any[];
    currentView: 'dashboard' | 'reports' | 'profile' | 'report-detail';
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
    creditResetDate: document.getElementById('creditResetDate') as HTMLElement,
    recentReportsList: document.getElementById('recentReportsList') as HTMLElement,
    emptyRecentState: document.getElementById('emptyRecentState') as HTMLElement,
    
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
    rawJsonContainer: document.getElementById('rawJsonContainer') as HTMLElement,
    
    // Theme
    themeToggle: document.getElementById('themeToggle') as HTMLElement,
    themeKnob: document.getElementById('themeKnob') as HTMLElement,
};

// ==========================================
// 3. Initialization
// ==========================================
async function initMypage() {
    setupEventListeners();
    initTheme();
    
    // Wait for auth state to resolve
    async function initMypage() {
    setupEventListeners();
    initTheme();
    showLoading();

    try {
        // 1) 페이지 최초 진입 시에는 Supabase 세션 기준으로 안정적으로 확인
        const { data, error } = await supabase.auth.getUser();

        if (error) {
            console.error('[mypage auth error]', error);
            window.location.href = '/';
            return;
        }

        const user = data.user;

        if (!user) {
            window.location.href = '/';
            return;
        }

        state.user = user;

        await Promise.all([
            fetchProfile(),
            fetchCredits(),
            fetchRecentReports()
        ]);

        updateDashboardUI();
        updateProfileUI();
        hideLoading();
        switchView('dashboard');

        // 2) 초기 진입이 끝난 뒤에만 auth 상태 변경 구독
        authService.onAuthStateChange(async (nextUser) => {
            if (!nextUser) {
                window.location.href = '/';
                return;
            }

            // 같은 유저면 굳이 다시 초기화하지 않음
            if (state.user?.id === nextUser.id) return;

            state.user = nextUser;
            showLoading();

            try {
                await Promise.all([
                    fetchProfile(),
                    fetchCredits(),
                    fetchRecentReports()
                ]);

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
// 4. Data Fetching
// ==========================================
async function fetchProfile() {
    if (!state.user) return;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', state.user.id)
        .single();
        
    if (error && error.code !== 'PGRST116') throw error;
    state.profile = data || { email: state.user.email, full_name: state.user.user_metadata?.full_name, plan_type: 'free' };
}

async function fetchCredits() {
    if (!state.user) return;
    const { data, error } = await supabase
        .from('usage_credits')
        .select('*')
        .eq('user_id', state.user.id)
        .single();
        
    if (error && error.code !== 'PGRST116') throw error;
    state.credits = data || { total_credits: 2, used_credits: 0 };
}

async function fetchRecentReports() {
    if (!state.user) return;
    const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('user_id', state.user.id)
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
        .order('created_at', { ascending: false });
        
    if (error) throw error;
    state.allReports = data || [];
    renderAllReports(state.allReports);
}

// ==========================================
// 5. UI Updates
// ==========================================
function updateDashboardUI() {
    const name = state.profile?.full_name || state.user?.email?.split('@')[0] || '고객';
    DOM.greetingMsg.textContent = `안녕하세요, ${name}님! 👋`;
    
    if (state.credits) {
        DOM.creditUsed.textContent = state.credits.used_credits.toString();
        DOM.creditTotal.textContent = state.credits.total_credits.toString();
        if (state.credits.reset_date) {
            const resetDate = new Date(state.credits.reset_date).toLocaleDateString();
            DOM.creditResetDate.textContent = `다음 충전일: ${resetDate}`;
        }
    }
    
    // Render Recent Reports
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

function openReportDetail(report: any) {
    DOM.detailTitle.textContent = report.title;
    DOM.detailDate.textContent = new Date(report.created_at).toLocaleDateString();
    
    // Display raw JSON for now, can be enhanced to render actual UI elements later
    DOM.rawJsonContainer.textContent = JSON.stringify(report.result_data, null, 2);
    
    switchView('report-detail');
}

// ==========================================
// 6. Navigation & Setup
// ==========================================
function switchView(viewId: string) {
    state.currentView = viewId as any;
    
    // Hide all views
    DOM.views.forEach(view => view.classList.remove('active'));
    
    // Show target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');
    
    // Update Nav
    DOM.navLinks.forEach(link => {
        if (link.getAttribute('data-target') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Special logic per view
    if (viewId === 'reports' && state.allReports.length === 0) {
        showLoading();
        fetchAllReports().finally(() => hideLoading());
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

    DOM.btnViewAllReports.addEventListener('click', () => switchView('reports'));
    DOM.btnBackToList.addEventListener('click', () => switchView('reports'));
    
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

    // Theme logic
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

// Start
document.addEventListener('DOMContentLoaded', initMypage);
