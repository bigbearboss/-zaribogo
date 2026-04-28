css_append = """
/* ==========================================
   Pre-contract Briefing Report Styles
   ========================================== */
.briefing-dashboard {
    max-width: 900px !important;
    margin: 0 auto;
    padding-top: 24px;
    background-color: var(--bg-main) !important;
}

.dashboard-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.section-heading {
    font-size: 1.4rem;
    font-weight: 800;
    margin-bottom: 20px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
}

/* 1. Verdict Banner */
.verdict-banner {
    background: linear-gradient(135deg, var(--bg-card), var(--bg-hover));
    border: 1px solid var(--border-color);
    border-left: 6px solid var(--accent-primary);
    border-radius: 16px;
    padding: 24px 32px;
    margin-bottom: 24px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}

.verdict-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.95rem;
}

.verdict-title {
    font-size: 1.8rem;
    font-weight: 800;
    line-height: 1.3;
    color: var(--text-primary);
    margin: 0;
}

/* 2. CRI Summary Card */
.cri-summary-card {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.cri-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 16px;
}

.cri-header h4 {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
}

.cri-disclaimer {
    font-size: 0.8rem;
    color: var(--text-muted);
}

.cri-main-row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 40px;
}

.cri-score-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.cri-breakdown-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 16px;
}

.cri-layer {
    background: rgba(255,255,255,0.02);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: transform 0.2s;
}
.cri-layer:hover {
    transform: translateY(-2px);
    border-color: var(--accent-primary);
}

.layer-title {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-weight: 600;
}
.layer-value {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--text-primary);
}
.layer-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
}

/* 3. Top Risk Factors */
.top-risk-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.top-risk-list li {
    background: rgba(239, 68, 68, 0.05); /* very soft red */
    border-left: 4px solid var(--accent-red, #ef4444);
    padding: 16px 20px;
    border-radius: 0 8px 8px 0;
    font-size: 0.95rem;
    color: var(--text-primary);
}
.top-risk-list li.risk-placeholder {
    background: var(--bg-input);
    border-color: var(--border-color);
    color: var(--text-muted);
}

/* Evidence Container overriding */
.risk-evidence .evidence-card {
    background: var(--bg-main) !important;
    border: 1px solid var(--border-color) !important;
    box-shadow: none !important;
}

/* 4. AI Strategy & Guide */
.ai-skeleton {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.skeleton-line {
    height: 16px;
    background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-card) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
}
.skeleton-line.title {
    height: 24px;
    width: 60%;
    margin-bottom: 8px;
}
.skeleton-pulse-text {
    font-size: 0.9rem;
    color: var(--accent-primary);
    animation: pulse 2s infinite;
    margin-top: 12px;
    text-align: center;
}

/* 5. Validation Checklist */
.checklist-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 2px solid var(--border-color);
}
.tab-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    padding: 12px 16px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    position: relative;
    top: 2px;
    transition: color 0.2s;
}
.tab-btn:hover {
    color: var(--text-primary);
}
.tab-btn.active {
    color: var(--accent-primary);
    border-bottom: 2px solid var(--accent-primary);
}

.tab-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.check-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
    background: var(--bg-main);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
}
.check-item:hover {
    border-color: var(--text-muted);
}
.check-item input[type="checkbox"] {
    margin-top: 4px;
    width: 18px;
    height: 18px;
    cursor: pointer;
}
.check-item input[type="checkbox"]:checked + span {
    text-decoration: line-through;
    color: var(--text-muted);
}

/* 6. Detail Accordion */
.detail-accordion {
    width: 100%;
}
.accordion-summary {
    display: block;
    padding: 20px 24px;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
    background: var(--bg-hover);
    cursor: pointer;
    list-style: none; /* Hide default triangle */
    transition: background 0.2s;
}
.accordion-summary:hover {
    background: var(--border-color);
}
.accordion-summary::-webkit-details-marker {
    display: none;
}
.detail-accordion[open] .accordion-summary {
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-main);
}
.accordion-summary::after {
    content: '▼';
    float: right;
    font-size: 0.8rem;
    color: var(--text-muted);
    transition: transform 0.3s;
}
.detail-accordion[open] .accordion-summary::after {
    transform: rotate(180deg);
}

/* Responsive Overrides */
@media (max-width: 768px) {
    .verdict-banner {
        padding: 20px;
        margin-left: 16px;
        margin-right: 16px;
    }
    .verdict-title {
        font-size: 1.4rem;
    }
    .cri-summary-card, .dashboard-card {
        padding: 20px;
        margin-left: 16px;
        margin-right: 16px;
        border-radius: 12px;
    }
    .cri-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
    .cri-main-row {
        flex-direction: column;
        gap: 20px;
    }
    .cri-breakdown-row {
        grid-template-columns: 1fr 1fr;
    }
    
    .checklist-tabs {
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
    }
    .tab-btn {
        padding: 10px 12px;
        font-size: 0.9rem;
    }
    .briefing-dashboard {
        padding-left: 0;
        padding-right: 0;
    }
    
    .cta-area-section {
        padding: 0 16px;
    }
}
"""

with open('src/style.css', 'a', encoding='utf-8') as f:
    f.write(css_append)

print("CSS appended to src/style.css")
