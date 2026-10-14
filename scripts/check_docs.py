"""Check local Markdown links in the maintained team-facing guides."""
from pathlib import Path
import re
from urllib.parse import unquote

root = Path(__file__).resolve().parents[1]
errors = []
for name in ('README.md', 'TEAM_IMPLEMENTATION_BRIEF.md', 'RUNBOOK.md',
             'MODEL_HANDOFF.md', 'FIELD_STRUCTURE_AND_SENSOR_GUIDE.md', 'PHASE1_UNDERSTANDING_GUIDE.md'):
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
