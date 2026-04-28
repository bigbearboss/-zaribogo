css_append_v2 = """
/* ==========================================
   Pre-contract Briefing Report v2
   ========================================== */
.dashboard-content-wrapper {
    max-width: 1080px;
    margin: 0 auto;
    width: 100%;
}

.briefing-dashboard {
    flex: 1; /* Ensures it fills remaining space horizontally if in flex row container */
    background-color: var(--bg-main) !important;
}

/* CRI View Compact (Right/Left) */
.cri-summary-layout {
    display: flex;
    flex-direction: column;
    gap: 32px;
}
.cri-summary-left {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}
.cri-title { margin: 0; font-size: 1.2rem; font-weight: 700; }
.cri-gauge-compact svg { max-height: 140px; } /* Shrink gauge */

.cri-summary-right {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
}
.cri-disclaimer-box {
    font-size: 0.85rem;
    color: var(--text-muted);
    background: var(--bg-main);
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}
.compact-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}
.compact-layer {
    padding: 12px;
    gap: 4px;
}
.compact-layer .layer-value, .compact-layer .breakdown-val {
    font-size: 1.2rem;
}

/* Desktop Grid overrides */
@media (min-width: 769px) {
    .cri-summary-layout {
        flex-direction: row;
        align-items: center;
    }
    .cri-summary-left {
        width: 300px;
        border-right: 1px dashed var(--border-color);
        padding-right: 32px;
    }
    .top-risk-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
    }
    .top-risk-list li {
        border-left: none;
        border-top: 4px solid var(--accent-red, #ef4444);
        border-radius: 0 0 8px 8px;
    }
}

/* AI Conclusion Styling */
.ai-conclusion-card {
    background: linear-gradient(180deg, rgba(88, 101, 242, 0.05), transparent);
    border: 1px solid var(--border-color);
}
.llm-content p:first-of-type {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-primary);
    background: var(--bg-main);
    padding: 16px;
    border-radius: 8px;
    border-left: 4px solid var(--accent-primary);
    margin-bottom: 20px;
}

/* Compact Checklist */
.compact-checklist .check-item {
    padding: 12px 16px;
    font-size: 0.9rem;
    align-items: center;
}
.checklist-hint {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 16px;
}

/* Sticky Bottom on Mobile */
@media (max-width: 768px) {
    .sticky-bottom-mobile {
        position: sticky;
        bottom: 0;
        left: 0;
        right: 0;
        background: var(--bg-card);
        padding: 16px;
        margin-left: -16px;
        margin-right: -16px;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
        z-index: 1000;
    }
}
"""

with open('src/style.css', 'a', encoding='utf-8') as f:
    f.write(css_append_v2)

print("CSS appended to src/style.css")
