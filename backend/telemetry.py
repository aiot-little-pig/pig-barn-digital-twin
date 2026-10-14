"""Local telemetry inbox. Immutable timestamped records, separated by dataset and subject."""
import json
import os
import sqlite3
from datetime import timezone
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field, model_validator
from backend.schemas import Contract, Number
from backend.data_sources.observations import ObservationDataset


class DisplayPolicy(Contract):
    min: Number
    max: Number
    warning: Number
    danger: Number
    basis: str = Field(min_length=1, max_length=300)
    demo: bool

    @model_validator(mode='after')
    def ordered(self):
        if not self.min <= self.warning < self.danger <= self.max or self.min >= self.max:
            raise ValueError('Invalid display policy')
        return self


class TelemetryBatch(Contract):
    dataset: ObservationDataset
    label: str = Field(min_length=1, max_length=120)
    position: tuple[Number, Number, Number]
    position_basis: Literal['assumed', 'verified'] = 'assumed'
    scope: Literal['sensor', 'farm'] = 'sensor'
    policy: DisplayPolicy | None = None

    @model_validator(mode='after')
    def placement(self):
        x, y, z = self.position
        if not (-6 <= x <= 6 and 0 <= y <= 3.5 and -9 <= z <= 9):
            raise ValueError('Position must be inside the current 12 x 18 x 3.5 m scene')
        if self.dataset.observation_source == 'historical' and self.policy and self.policy.demo:
            raise ValueError('Measured records cannot use a demo risk policy')
        return self


class TelemetryStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = Lock()

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        try:
            with db:
                db.execute('CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
                yield db
        finally:
            db.close()

    def append(self, batch):
        incoming = batch.model_dump(mode='json')
        ds = incoming['dataset']
        for encoded, original in zip(ds['records'], batch.dataset.records):
            encoded['observed_at'] = original.observed_at.astimezone(timezone.utc).isoformat()
        key = json.dumps([ds[k] for k in ('dataset_id', 'dataset_version', 'farm_id', 'subject_id')])
        with self.lock, self.connect() as db:
            row = db.execute('SELECT payload FROM series WHERE id=?', (key,)).fetchone()
            if row:
                old = json.loads(row[0])
                old_meta = {**old, 'dataset': {k:v for k,v in old['dataset'].items() if k != 'records'}}
                new_meta = {**incoming, 'dataset': {k:v for k,v in ds.items() if k != 'records'}}
                if old_meta != new_meta:
                    raise ValueError('Metadata changed; use a new dataset version')
                records = {r['observed_at']:r for r in old['dataset']['records']}
            else:
                if db.execute('SELECT count(*) FROM series').fetchone()[0] >= 100:
                    raise ValueError('Inbox series limit is 100')
                records = {}
            added = 0
            for record in ds['records']:
                previous = records.get(record['observed_at'])
                if previous is not None and previous != record:
                    raise ValueError('Conflicting observation at the same timestamp; nothing was written')
                if previous is None:
                    records[record['observed_at']] = record
                    added += 1
            if len(records) > 20000:
                raise ValueError('Series exceeds 20000 observations; split dataset version')
            incoming['dataset']['records'] = sorted(records.values(), key=lambda r:r['observed_at'])
            db.execute('INSERT OR REPLACE INTO series VALUES (?,?)', (key, json.dumps(incoming)))
            return {'accepted': added, 'total': len(records), 'source': ds['observation_source']}

    def bundle(self, dataset_id, dataset_version):
        with self.lock, self.connect() as db:
            items = [json.loads(r[0]) for r in db.execute('SELECT payload FROM series ORDER BY id')]
        selected = [b for b in items if b['dataset']['dataset_id'] == dataset_id
                    and b['dataset']['dataset_version'] == dataset_version]
        if not selected:
            raise LookupError('No received observations for this dataset/version')
        if sum(len(b['dataset']['records']) for b in selected) > 20000:
            raise ValueError('Selected dataset exceeds the viewer limit of 20000 observations')
        series = []
        for b in selected:
            ds = b['dataset']
            series.append({**{k:ds[k] for k in ('dataset_id','dataset_version','farm_id','subject_id',
                           'observation_source','unit','records')},
                           **{k:b[k] for k in ('label','position','position_basis','scope','policy')}})
        return {'schema_version':'twin-1', 'series':series}


router = APIRouter(prefix='/api/v2/telemetry', tags=['Sensor inbox'])
store = TelemetryStore(os.environ.get('TELEMETRY_DB', str(Path(__file__).resolve().parents[1] / '.runtime' / 'telemetry.sqlite3')))


@router.post('/observations')
def receive(batch: TelemetryBatch):
    try:
        return store.append(batch)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get('/bundle')
def received_bundle(response: Response, dataset_id: str, dataset_version: str):
    response.headers['Cache-Control'] = 'no-store'
    try:
        return store.bundle(dataset_id, dataset_version)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
