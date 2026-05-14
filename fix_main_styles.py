import re

with open("src/main.ts", "r") as f:
    content = f.read()

# 1. risk-grade-desc color
content = re.sub(
    r'class="risk-grade-desc" style="font-weight:800; font-size:1.2rem; color:#111827; margin-top:8px;"',
    r'class="risk-grade-desc" style="font-weight:800; font-size:1.2rem; color:var(--text-primary); margin-top:8px;"',
    content
)

# 2. check-circle color
content = re.sub(
    r'color:#d97706;',
    r'color:var(--warning-amber);',
    content
)

# 3. risk-grade-tip inline background
content = re.sub(
    r'class="risk-grade-tip" style="margin-top:16px; border:none; background:#ffffff; font-size:0.8rem; color:#64748b;"',
    r'class="risk-grade-tip" style="margin-top:16px; border:none; font-size:0.8rem;"',
    content
)

# 4. color:#1e40af
content = re.sub(
    r'color:#1e40af;',
    r'color:var(--brand-blue-strong);',
    content
)

# 5. border-left: 4px solid #7c3aed
content = re.sub(
    r'border-left:\s*4px solid #7c3aed;',
    r'border-left: 4px solid var(--ai-purple);',
    content
)

# 6. color:#7c3aed
content = re.sub(
    r'color:#7c3aed;',
    r'color:var(--ai-purple);',
    content
)

# 7. color:#f59e0b
content = re.sub(
    r'color:#f59e0b;',
    r'color:var(--warning-amber);',
    content
)

# 8. background:#f8fafc;
content = re.sub(
    r'background:#f8fafc;',
    r'background:var(--surface-subtle);',
    content
)

# 9. color:#2563eb
content = re.sub(
    r'color:#2563eb;',
    r'color:var(--brand-blue);',
    content
)

# 10. color:#10b981
content = re.sub(
    r'color:#10b981;',
    r'color:var(--success-green);',
    content
)

# 11. color:#3b82f6
content = re.sub(
    r'color:#3b82f6;',
    r'color:var(--brand-blue);',
    content
)

# 12. caution-banner inline styles
content = re.sub(
    r'class="caution-banner" style="background:#fffbeb; border-color:#fef3c7; border-radius:12px; padding:20px; border:1px solid #fde68a;"',
    r'class="caution-banner"',
    content
)

# 13. caution-header inline colors
content = re.sub(
    r'class="caution-header" style="color:#b45309; font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:8px;"',
    r'class="caution-header"',
    content
)

# 14. caution-desc inline color
content = re.sub(
    r'class="text-desc" style="color:#92400e; font-size:0.8rem;"',
    r'class="caution-desc"',
    content
)

# 15. Make sure the financial layout div which had inline styles has no hardcoded background
# wait, background:#f8fafc was handled by #8.

with open("src/main.ts", "w") as f:
    f.write(content)

print("Updated main.ts inline styles.")
