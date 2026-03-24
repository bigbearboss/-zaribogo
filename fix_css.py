import re

def process_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Define variables in :root
    root_vars = """  --panel-bg: rgba(255, 255, 255, 0.03);
  --panel-highlight: rgba(255, 255, 255, 0.05);"""
    
    light_vars = """  --panel-bg: #ffffff;
  --panel-highlight: rgba(0, 0, 0, 0.04);"""

    # Inject variables after --input-bg
    content = re.sub(r'(--input-bg:.*?\n)', r'\1' + root_vars + '\n', content, count=1)
    
    # Inject variables after light theme --input-bg
    content = re.sub(r'(\[data-theme="light"\] \{\n.*?--input-bg:.*?\n)', r'\1' + light_vars + '\n', content, count=1, flags=re.DOTALL)

    # Replace transparent white backgrounds
    content = re.sub(r'(background(?:-color)?:\s*)rgba\(255,\s*255,\s*255,\s*0\.0[2345]\)', r'\1var(--panel-bg)', content)
    content = re.sub(r'(background(?:-color)?:\s*)rgba\(255,\s*255,\s*255,\s*0\.0[6789]\)', r'\1var(--panel-highlight)', content)

    # For borders matching 0.05 to 0.1
    content = re.sub(r'(border(?:-[a-z]+)?:\s*1px\s+solid\s+)rgba\(255,\s*255,\s*255,\s*0\.0[56789]\)', r'\1var(--glass-border)', content)
    content = re.sub(r'(border(?:-[a-z]+)?:\s*1px\s+solid\s+)rgba\(255,\s*255,\s*255,\s*0\.1\)', r'\1var(--glass-border)', content)
    
    with open(filename, 'w') as f:
        f.write(content)

process_file('src/style.css')
