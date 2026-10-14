"""Explicit allowlist release, never copies environments, logs, tokens or local config."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'deliverables'
out.mkdir(exist_ok=True)
files = set()
for directory in ('src', 'dist', 'examples', 'tests', 'scripts', 'backend', 'docs', 'stage-assets', 'meeting-assets'):
    for path in (ROOT / directory).rglob('*'):
        rel = path.relative_to(ROOT)
        if path.is_file() and not path.is_symlink() and not any(p.startswith('.') or p in ('__pycache__', 'node_modules') for p in rel.parts) and path.suffix not in ('.pyc', '.log'):
            files.add(path)
for name in ('package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'setup.cmd', 'start.cmd', 'stop.cmd', 'status.cmd', 'launcher.example.json', 'launcher.http.example.json', 'launcher.file.example.json', 'RUNBOOK.md', 'MODEL_HANDOFF.md', 'PHASE1_UNDERSTANDING_GUIDE.md'):
    path = ROOT / name
    if not path.is_file():
        raise RuntimeError(f'Missing required release file: {name}')
    files.add(path)
if not (ROOT / 'dist/index.html').is_file():
    raise RuntimeError('Build the frontend first')
for name in ('TEAM_IMPLEMENTATION_BRIEF.md', 'FIELD_STRUCTURE_AND_SENSOR_GUIDE.md', 'README.md'):
    path = ROOT / name
    files.add(path)
manifest = {str(p.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
archive = out / 'barn-digital-twin-2026-10-14-team.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for path in sorted(files):
        z.write(path, 'barn-simulator/' + path.relative_to(ROOT).as_posix())
    z.writestr('barn-simulator/MANIFEST.sha256.json', json.dumps(manifest, indent=2))
print(f'{archive}\n{len(files)} files | {archive.stat().st_size} bytes')
