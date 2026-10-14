"""Check local Markdown links in the maintained project documentation."""
from pathlib import Path
import re
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
errors = []
for name in ('README.md', 'RUNBOOK.md', 'backend/PREDICTOR_GUIDE.md'):
    path = root / name
    for link in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if link.startswith(('http:', 'https:', '#', 'mailto:')):
            continue
        target = unquote(link.split('#')[0])
        if target and not (path.parent / target).exists():
            errors.append(f'{name}: {link}')
if errors:
    raise SystemExit('\n'.join(errors))
print('Maintained document links OK')
