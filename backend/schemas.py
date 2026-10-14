"""Model-independent prediction contract. Historical time is not network freshness."""
from datetime import timedelta
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(min_length=1, max_length=120, pattern=r'^\S(?:.*\S)?$')]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Concentration = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
Unit = Literal['ppm', 'relative_index']


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Observation(Contract):
    observed_at: AwareDatetime
    nh3: Concentration | None
    # Feature names/units and preprocessing belong to the dataset/model manifest.
    features: dict[str, Number | None] = Field(default_factory=dict)


class PredictionRequest(Contract):
    schema_version: Literal['prediction-1'] = 'prediction-1'
    request_id: Identifier
    dataset_id: Identifier
    dataset_version: Identifier
    farm_id: Identifier
    subject_id: Identifier
    condition_id: Identifier
    model_id: Identifier
    model_version: Identifier
    observation_source: Literal['historical', 'synthetic_fixture']
    unit: Unit
    issued_at: AwareDatetime
    horizon_minutes: Literal[30] = 30
    history: list[Observation] = Field(max_length=20000)

    @model_validator(mode='after')
    def past_only(self):
        times = [row.observed_at for row in self.history]
        if times != sorted(set(times)):
            raise ValueError('History must be strictly chronological without duplicate times')
        if any(t > self.issued_at for t in times):
            raise ValueError('Future observations must not enter prediction history')
        return self


class PredictionResult(Contract):
    schema_version: Literal['prediction-1'] = 'prediction-1'
    request_id: Identifier
    dataset_id: Identifier
    dataset_version: Identifier
    farm_id: Identifier
    subject_id: Identifier
    condition_id: Identifier
    model_id: Identifier
    model_version: Identifier
    observation_source: Literal['historical', 'synthetic_fixture']
    prediction_source: Literal['mock', 'model_output', 'synthetic_fixture']
    unit: Unit
    issued_at: AwareDatetime
    target_at: AwareDatetime
    generated_at: AwareDatetime | None
    horizon_minutes: Literal[30] = 30
    status: Literal['ok', 'insufficient_input', 'unavailable']
    prediction: Number | None = None
    lower: Number | None = None
    upper: Number | None = None
    nominal_coverage: Annotated[float, Field(strict=True, gt=0, lt=1, allow_inf_nan=False)] | None = None
    interval_method: Identifier | None = None
    message: str | None = Field(default=None, max_length=300)

    @model_validator(mode='after')
    def coherent(self):
        if self.target_at != self.issued_at + timedelta(minutes=self.horizon_minutes):
            raise ValueError('Target time must equal issue time + 30 minutes')
        if (self.status == 'ok') != (self.prediction is not None):
            raise ValueError('Only successful predictions contain a point estimate')
        interval = [self.lower, self.upper, self.nominal_coverage, self.interval_method]
        if any(x is not None for x in interval):
            if self.status != 'ok' or any(x is None for x in interval):
                raise ValueError('An interval requires bounds, coverage, method and a successful prediction')
            if self.lower > self.upper:
                raise ValueError('Interval bounds are reversed')
        return self


IDENTITY_FIELDS = (
    'dataset_id', 'dataset_version', 'farm_id', 'subject_id', 'condition_id',
    'model_id', 'model_version', 'observation_source', 'unit', 'issued_at', 'horizon_minutes',
)


def identity(request):
    return {name: getattr(request, name) for name in IDENTITY_FIELDS}


def validate_match(request: PredictionRequest, result: PredictionResult):
    if result.request_id != request.request_id or identity(request) != identity(result):
        raise ValueError('Prediction response does not match request identity, time or unit')
    return result


class PredictionArchive(Contract):
    schema_version: Literal['prediction-archive-1'] = 'prediction-archive-1'
    records: list[PredictionResult] = Field(min_length=1, max_length=20000)

    @model_validator(mode='after')
    def unique(self):
        keys = [tuple(identity(row).values()) for row in self.records]
        if len(keys) != len(set(keys)):
            raise ValueError('Duplicate forecast identity in archive')
        return self
