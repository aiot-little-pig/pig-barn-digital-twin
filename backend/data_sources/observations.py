"""Single farm/subject series. Multiple farms use separate stores, not mixed histories."""
import csv
from pathlib import Path
from typing import Literal

from pydantic import AwareDatetime, Field, model_validator

from backend.schemas import Contract, Identifier, Observation, PredictionRequest, Unit


class ObservationDataset(Contract):
    schema_version: Literal['observations-1'] = 'observations-1'
    dataset_id: Identifier
    dataset_version: Identifier
    farm_id: Identifier
    subject_id: Identifier
    observation_source: Literal['historical', 'synthetic_fixture']
    unit: Unit
    nominal_interval_seconds: int | None = Field(default=None, gt=0, strict=True)
    feature_units: dict[str, str] = Field(default_factory=dict)
    records: list[Observation] = Field(min_length=1, max_length=20000)

    @model_validator(mode='after')
    def coherent(self):
        times = [r.observed_at for r in self.records]
        if len(times) != len(set(times)):
            raise ValueError('Duplicate observation timestamp')
        if any(set(r.features) - set(self.feature_units) for r in self.records):
            raise ValueError('Every feature requires unit metadata')
        self.records = sorted(self.records, key=lambda r: r.observed_at)
        return self


def load_json(path):
    return ObservationDataset.model_validate_json(Path(path).read_text(encoding='utf-8-sig'))


def load_csv(path, metadata, columns=None):
    """Explicit column mapping; blanks are missing, no interpolation or unit guessing."""
    columns = columns or {'observed_at': 'observed_at', 'nh3': 'nh3'}
    if set(columns) != {'observed_at', 'nh3'}:
        raise ValueError('CSV mapping must name observed_at and nh3 columns')
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not set(columns.values()) <= set(reader.fieldnames or []):
            raise ValueError('CSV is missing required columns')
        rows = []
        for row in reader:
            if len(rows) >= 20000:
                raise ValueError('CSV is limited to 20000 records')
            raw = row[columns['nh3']]
            if raw is None:
                raise ValueError('CSV row is structurally incomplete')
            rows.append({'observed_at': row[columns['observed_at']],
                         'nh3': None if not raw.strip() else float(raw)})
    return ObservationDataset.model_validate({**metadata, 'records': rows})


class ObservationStore:
    def __init__(self, dataset: ObservationDataset):
        self.dataset = dataset

    def request_at(self, *, issued_at: AwareDatetime, request_id: str, condition_id: str,
                   model_id: str, model_version: str, lookback_minutes: int = 60):
        from datetime import timedelta
        if lookback_minutes <= 0:
            raise ValueError('Lookback must be positive')
        meta = self.dataset.model_dump(exclude={'records', 'schema_version', 'nominal_interval_seconds', 'feature_units'})
        start = issued_at - timedelta(minutes=lookback_minutes)
        history = [row for row in self.dataset.records if start <= row.observed_at <= issued_at]
        return PredictionRequest(**meta, request_id=request_id, condition_id=condition_id,
                                 model_id=model_id, model_version=model_version,
                                 issued_at=issued_at, history=history)
