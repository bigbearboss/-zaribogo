/**
 * appMode.ts
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for runtime application mode.
 *
 * Modes:
 *   user        — default, production-safe:
 *                 no perf logs, no QA scenario UI, no test runner
 *   qa          — internal QA: QA scenario selector + perf logs visible
 *                 access via /?mode=qa
 *   test_runner — automated regression: 10-case batch runner
 *                 access via /?mode=test
 *
 * Usage:
 *   import { getAppMode, conditionalLog, isQaModeActive } from './engine/appMode';
 */

export type AppMode = 'user' | 'qa' | 'test_runner';

let _cachedMode: AppMode | null = null;

/**
 * Returns the current AppMode based on the URL query parameter `mode`.
 * Result is cached for the lifetime of the page.
 */
export function getAppMode(): AppMode {
    if (_cachedMode !== null) return _cachedMode;
    const param = new URLSearchParams(window.location.search).get('mode');
    if (param === 'qa') { _cachedMode = 'qa'; return _cachedMode; }
    if (param === 'test') { _cachedMode = 'test_runner'; return _cachedMode; }
    _cachedMode = 'user';
    return _cachedMode;
}

/** True only in 'qa' or 'test_runner' mode — enables console perf logs. */
export function isPerfLoggingEnabled(): boolean {
    return getAppMode() !== 'user';
}

/** True only in 'qa' mode — shows QA scenario selector UI. */
export function isQaModeActive(): boolean {
    return getAppMode() === 'qa';
}

/** True only in 'test_runner' mode — activates batch test runner. */
export function isTestRunnerActive(): boolean {
    return getAppMode() === 'test_runner';
}

/**
 * Conditional console.log: only prints when perf logging is enabled.
 * Replaces raw console.log([Perf] ...) calls in production user flows.
 *
 * @example
 *   conditionalLog(`[Perf] csv:query_time = ${ms}ms`);
 */
export function conditionalLog(message: string, ...args: any[]): void {
    if (isPerfLoggingEnabled()) {
        console.log(message, ...args);
    }
}

/**
 * Applies mode-specific CSS classes to the document root.
 * Call once on page load to gate visibility of QA/test UI via CSS.
 *
 * - `data-app-mode="user"`        → hides [data-qa-only], [data-test-only]
 * - `data-app-mode="qa"`          → shows [data-qa-only]
 * - `data-app-mode="test_runner"` → shows [data-test-only]
 */
export function applyModeToDocument(): void {
    const mode = getAppMode();
    document.documentElement.setAttribute('data-app-mode', mode);
    if (mode !== 'user') {
        console.info(`[AppMode] Running in mode: ${mode.toUpperCase()}`);
    }
}
