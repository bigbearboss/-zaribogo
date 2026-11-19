type AnalysisPanel = 'inputs' | 'results';

const mobile = window.matchMedia('(max-width: 1023px)');
let activePanel: AnalysisPanel = 'inputs';

function syncPanels() {
  const app = document.getElementById('app');
  if (!app) return;
  app.dataset.mobilePanel = activePanel;
  for (const panel of ['inputs', 'results'] as const) {
    const element = document.getElementById(panel === 'inputs' ? 'analysisInputs' : 'analysisResults');
    const tab = document.getElementById(`${panel}Tab`);
    const selected = activePanel === panel;
    tab?.setAttribute('aria-selected', String(selected));
    if (tab) tab.tabIndex = selected ? 0 : -1;
    if (!element) continue;
    element.hidden = mobile.matches && !selected;
    if (mobile.matches) {
      element.setAttribute('role', 'tabpanel');
      element.setAttribute('aria-labelledby', `${panel}Tab`);
    } else {
      element.removeAttribute('role');
      element.removeAttribute('aria-labelledby');
    }
  }
}

export function showAnalysisPanel(panel: AnalysisPanel, focus = false) {
  activePanel = panel;
  syncPanels();
  if (mobile.matches) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (focus) document.getElementById(`${panel}Tab`)?.focus({ preventScroll: true });
  } else if (focus) {
    const element = document.getElementById(panel === 'inputs' ? 'analysisInputs' : 'analysisResults');
    element?.scrollTo({ top: 0 });
    element?.focus({ preventScroll: true });
  }
}

export function openAnalysisApp() {
  document.getElementById('landingPage')?.classList.add('hidden');
  document.getElementById('app')?.classList.remove('hidden');
  document.body.classList.add('analysis-active');
  showAnalysisPanel('inputs');
  window.scrollTo(0, 0);
}

function openLanding() {
  document.getElementById('app')?.classList.add('hidden');
  const landing = document.getElementById('landingPage');
  landing?.classList.remove('hidden');
  landing?.style.removeProperty('display');
  document.body.classList.remove('analysis-active');
  window.scrollTo(0, 0);
  document.querySelector<HTMLButtonElement>('.btn-start-app')?.focus({ preventScroll: true });
}

export function setAnalysisNotice(message = '') {
  const notice = document.getElementById('analysisNotice');
  if (!notice) return;
  notice.textContent = message;
  notice.hidden = !message;
}

export function initAppShell() {
  document.querySelectorAll('.btn-start-app').forEach(button => button.addEventListener('click', openAnalysisApp));
  document.querySelectorAll('[data-app-home]').forEach(button => button.addEventListener('click', openLanding));
  document.querySelectorAll<HTMLElement>('[data-analysis-panel]').forEach(button => {
    button.addEventListener('click', () => showAnalysisPanel(button.dataset.analysisPanel as AnalysisPanel));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'inputs' : event.key === 'End' ? 'results' : activePanel === 'inputs' ? 'results' : 'inputs';
      showAnalysisPanel(next, true);
    });
  });
  mobile.addEventListener('change', syncPanels);
  syncPanels();

  // Reserve the actual footer height, including wrapped status messages and safe areas.
  const submit = document.querySelector<HTMLElement>('.analysis-submit');
  if (submit) {
    new ResizeObserver(() => {
      const height = submit.getBoundingClientRect().height;
      if (height > 0) document.documentElement.style.setProperty('--analysis-submit-height', `${height}px`);
    }).observe(submit);
  }

  const menuButton = document.querySelector<HTMLButtonElement>('.land-mobile-menu-btn');
  const menu = document.getElementById('landingNav');
  const closeMenu = () => {
    menu?.classList.remove('active');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', '메뉴 열기');
  };
  menuButton?.addEventListener('click', () => {
    const opened = menu?.classList.toggle('active') ?? false;
    menuButton.setAttribute('aria-expanded', String(opened));
    menuButton.setAttribute('aria-label', opened ? '메뉴 닫기' : '메뉴 열기');
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.classList.contains('active')) {
      closeMenu();
      menuButton?.focus();
    }
  });

  // Retain existing click behavior while making custom controls keyboard usable.
  ['themeToggle', 'businessTypeTrigger'].forEach(id => {
    const control = document.getElementById(id);
    control?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        control.click();
      }
    });
  });
  const dropdown = document.getElementById('businessTypeDropdown');
  if (dropdown) {
    new MutationObserver(() => {
      document.getElementById('businessTypeTrigger')?.setAttribute('aria-expanded', String(!dropdown.classList.contains('hidden')));
    }).observe(dropdown, { attributes: true, attributeFilter: ['class'] });
  }
}
