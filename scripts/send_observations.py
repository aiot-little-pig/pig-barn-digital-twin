"""Mock sender or explicit CSV adapter; both POST to the same local sensor inbox."""
import argparse
import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.data_sources.observations import load_csv
from backend.telemetry import TelemetryBatch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8000')
    parser.add_argument('--csv', type=Path)
    parser.add_argument('--manifest', type=Path, help='Required with CSV: TelemetryBatch metadata, no records')
    args = parser.parse_args()
    if args.csv:
        if not args.manifest:
            parser.error('--csv requires --manifest; source, units and placement must be explicit')
        payload = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
        dataset = load_csv(args.csv, payload['dataset'])
        batches = [{**payload, 'dataset':dataset.model_dump(mode='json')}]
    else:
        if args.manifest:
            parser.error('--manifest requires --csv')
        start = datetime(2026, 10, 14, tzinfo=timezone.utc)
        batches = []
        for i, x in enumerate((-3., 3.)):
            batches.append(dict(label=f'NH3 센서 {i+1} · Mock', position=[x, 1.2, -3.],
                position_basis='assumed', scope='sensor',
                policy=dict(min=0., max=35., warning=15., danger=22., demo=True, basis='합성 시연 기준'),
                dataset=dict(schema_version='observations-1', dataset_id='SENSOR-MOCK', dataset_version='1',
                    farm_id='DEMO-BARN', subject_id=f'nh3-{i+1}', observation_source='synthetic_fixture',
                    unit='ppm', nominal_interval_seconds=60, feature_units={'temperature':'degC','humidity':'%RH'},
                    records=[dict(observed_at=(start+timedelta(minutes=m)).isoformat(),
                        nh3=round(10+i+15*math.exp(-((m-45)/18)**2),3),
                        features={'temperature':24.,'humidity':65.}) for m in range(91)])))
    for batch in batches:
        checked = TelemetryBatch.model_validate(batch)
        request = Request(args.url.rstrip('/')+'/api/v2/telemetry/observations',
            data=checked.model_dump_json().encode(), headers={'Content-Type':'application/json'}, method='POST')
        with urlopen(request, timeout=10) as response:
            print(checked.dataset.subject_id, response.read().decode())
    print('화면: 관측 데이터 가져오기 → 수신 기록 불러오기 → 예측 API 연결. 자동 실측/자동 학습 아님.')


if __name__ == '__main__':
    main()
