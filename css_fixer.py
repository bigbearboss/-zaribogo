import re

with open("src/zentropa-report.css", "r") as f:
    css = f.read()

# Remove the old :root block completely
css = re.sub(r':root\s*\{[^}]+\}', '', css)

# Replace zentropa-report background and color
css = re.sub(r'(\.zentropa-report\s*\{[^}]*)background-color:\s*#[0-9a-fA-F]+;', r'\1background-color: var(--page-bg);', css)
css = re.sub(r'(\.zentropa-report\s*\{[^}]*)color:\s*var\(--report-text\);', r'\1color: var(--text-primary);', css)

# 1. Risk Grade Banner
css = re.sub(
    r'\.risk-grade-banner\s*\{[^}]+\}',
    r'''.risk-grade-banner {
  background: #FFF7ED;
  border: 1px solid #FDBA74;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
[data-theme="dark"] .risk-grade-banner {
  background: rgba(251, 146, 60, 0.12);
  border: 1px solid rgba(251, 146, 60, 0.35);
}''',
    css
)

css = re.sub(
    r'\.risk-grade-header\s*\{[^}]+\}',
    r'''.risk-grade-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 1.1rem;
  color: #C2410C;
}
[data-theme="dark"] .risk-grade-header {
  color: #FDBA74;
}''',
    css
)

css = re.sub(r'color:\s*#4b5563;', 'color: var(--text-secondary);', css)
css = re.sub(r'background:\s*#ffffff;', 'background: var(--surface-main);', css)
css = re.sub(r'background:\s*#fff7ed;', 'background: var(--warning-amber); color: #fff;', css)
css = re.sub(r'border:\s*1px solid var\(--report-border\);', 'border: 1px solid var(--border-soft);', css)
css = re.sub(r'color:\s*var\(--text-warning\);', 'color: var(--warning-amber);', css)
css = re.sub(r'color:\s*#64748b;', 'color: var(--text-muted);', css)
css = re.sub(r'color:\s*#111827;', 'color: var(--text-primary);', css)

# 2. AI Summary Card
css = re.sub(
    r'\.zentropa-ai-card\s*\{[^}]+\}',
    r'''.zentropa-ai-card {
  background: linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%);
  border: 1px solid #BFDBFE;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  overflow: hidden;
}
[data-theme="dark"] .zentropa-ai-card {
  background: linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.16));
  border: 1px solid rgba(96,165,250,0.32);
}''',
    css
)

css = re.sub(
    r'\.zentropa-ai-title\s*\{[^}]+\}',
    r'''.zentropa-ai-title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #1D4ED8;
  margin-bottom: 8px;
  line-height: 1.6;
}
[data-theme="dark"] .zentropa-ai-title {
  color: #93C5FD;
}''',
    css
)

css = re.sub(
    r'\.zentropa-ai-badge\s*\{[^}]+\}',
    r'''.zentropa-ai-badge {
  background: var(--surface-main);
  color: var(--brand-blue);
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 12px;
  display: inline-block;
  box-shadow: var(--shadow-report);
}''',
    css
)

# 3. CRI Section
css = re.sub(
    r'\.zentropa-card\s*\{[^}]+\}',
    r'''.zentropa-card {
  background: var(--surface-main);
  border: 1px solid var(--border-soft);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-report);
  color: var(--text-primary);
  box-sizing: border-box;
}''',
    css
)

# 4. Badges
css = re.sub(
    r'\.badge-calc\s*\{[^}]+\}',
    r'''.badge-calc {
  background: #EFF6FF;
  color: #2563EB;
  border: 1px solid #BFDBFE;
}
[data-theme="dark"] .badge-calc {
  background: rgba(59,130,246,0.16);
  color: #93C5FD;
  border: 1px solid rgba(59,130,246,0.3);
}''', css
)

css = re.sub(
    r'\.badge-public\s*\{[^}]+\}',
    r'''.badge-public {
  background: #EFF6FF;
  color: #2563EB;
  border: 1px solid #BFDBFE;
}
[data-theme="dark"] .badge-public {
  background: rgba(59,130,246,0.16);
  color: #93C5FD;
  border: 1px solid rgba(59,130,246,0.3);
}''', css
)

css = re.sub(
    r'\.badge-input\s*\{[^}]+\}',
    r'''.badge-input {
  background: #F1F5F9;
  color: #475569;
  border: 1px solid #E2E8F0;
}
[data-theme="dark"] .badge-input {
  background: rgba(148,163,184,0.16);
  color: #CBD5E1;
  border: 1px solid rgba(148,163,184,0.3);
}''', css
)

# Gauge
css = re.sub(
    r'\.cri-circle-bg\s*\{[^}]+\}',
    r'''.cri-circle-bg {
  fill: none;
  stroke: var(--border-soft);
  stroke-width: 8;
}''', css
)

css = re.sub(r'color:\s*#1e3a8a;', 'color: var(--text-primary);', css)

with open("src/zentropa-report.css", "w") as f:
    f.write(css)

print("Updated partially.")
