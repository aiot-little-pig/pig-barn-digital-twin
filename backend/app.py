"""합성 재생과 교체 가능한 예측 API. 실물 팬 명령은 수행하지 않습니다."""
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, model_validator
from backend.schemas import PredictionRequest, PredictionResult, validate_match
from backend.predictors import ProviderError
from backend.predictors.config import get_predictor
from backend.telemetry import router as telemetry_router

DATA = json.loads(Path(__file__).with_name('demo_runs.json').read_text(encoding='utf-8'))
Scenario = Literal['C1', 'C2', 'C3', 'C4']
Index = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Cell = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Grid(Contract):
    width_m: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    length_m: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    columns: Annotated[int, Field(ge=1, le=256)]
    rows: Annotated[int, Field(ge=1, le=256)]
    coordinates: Literal['center-origin:column=+X,row=+Z']
    meaning: Literal['current_relative_index']
    values: list[list[Cell | None]]

    @model_validator(mode='after')
    def rectangular(self):
        if len(self.values) != self.rows or any(len(row) != self.columns for row in self.values):
            raise ValueError('격자 크기와 rows/columns가 일치해야 합니다.')
        return self


class Actuators(Contract):
    pwm_percent: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)] | None
    rpm: Index | None
    scrubber_on: bool | None


class Snapshot(Contract):
    schema_version: Literal['1.0']
    source: Literal['synthetic-replay']
    scenario: Scenario
    simulation_minute: Index
    generated_at: AwareDatetime
    data_at: AwareDatetime
    forecast_for: AwareDatetime
    horizon_minutes: Annotated[float, Field(gt=0, allow_inf_nan=False)]
    unit: Literal['relative_index']
    normalization: Literal['demo-index-v1;heatmap-clipped-0-1']
    current_index: Index | None
    predicted_index: Index | None
    grid: Grid
    actuators: Actuators
    reason: str

    @model_validator(mode='after')
    def coherent_time(self):
        if abs((self.forecast_for - self.data_at).total_seconds() - self.horizon_minutes * 60) > 1:
            raise ValueError('예측 시각과 horizon_minutes가 일치해야 합니다.')
        if self.generated_at < self.data_at:
            raise ValueError('생성 시각은 데이터 시각보다 빨라질 수 없습니다.')
        return self


app = FastAPI(title='돈사 시뮬레이터 재생·예측 API', version='2.0.0')
app.include_router(telemetry_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f'http://{host}:{port}' for host in ('127.0.0.1', 'localhost') for port in (4173, 5173)],
    allow_methods=['GET', 'POST'], allow_headers=['Accept', 'Content-Type'], allow_credentials=False,
)


def build_snapshot(scenario: Scenario, minute: float) -> Snapshot:
    """미래에 모델/저장소 어댑터로 교체할 공급 함수. 현재는 합성 fixture만 읽음."""
    p = DATA['parameters']
    position = minute / p['stepMinutes']
    if minute > p['durationMinutes'] or not math.isclose(position, round(position), abs_tol=1e-8):
        raise HTTPException(422, '재생 범위 또는 계산 간격에 맞지 않는 minute입니다.')
    frame = DATA['runs'][scenario][round(position)]
    now = datetime.now(timezone.utc)
    values = [[min(1, max(0, frame['current'] * weight)) for weight in row] for row in DATA['weights']]
    return Snapshot(
        schema_version='1.0', source='synthetic-replay', scenario=scenario,
        simulation_minute=frame['time'], generated_at=now, data_at=now,
        forecast_for=now + timedelta(minutes=p['forecastHorizon']), horizon_minutes=p['forecastHorizon'],
        unit='relative_index', normalization='demo-index-v1;heatmap-clipped-0-1',
        current_index=frame['current'], predicted_index=frame['predicted'],
        grid=Grid(width_m=DATA['barn']['width'], length_m=DATA['barn']['length'],
                  rows=len(values), columns=len(values[0]), values=values,
                  coordinates='center-origin:column=+X,row=+Z', meaning='current_relative_index'),
        actuators=Actuators(pwm_percent=frame['pwm'], rpm=frame['rpm'], scrubber_on=frame['scrubberOn']),
        reason=frame['reason'],
    )


@app.get('/health')
def health():
    return {'status': 'ok', 'source': 'synthetic-replay'}


@app.get('/api/v1/snapshot', response_model=Snapshot)
def snapshot(response: Response, scenario: Scenario = 'C3', minute: float = Query(0, ge=0, allow_inf_nan=False)):
    response.headers['Cache-Control'] = 'no-store'
    return build_snapshot(scenario, minute)


@app.post('/api/v2/predict', response_model=PredictionResult)
def predict(request: PredictionRequest, response: Response):
    """Prediction only: no device command and no future ground truth in this contract."""
    response.headers['Cache-Control'] = 'no-store'
    try:
        provider = get_predictor()
    except (KeyError, ValueError, OSError):
        raise HTTPException(503, 'Predictor configuration is invalid; check server settings')
    try:
        return validate_match(request, provider.predict(request))
    except (ProviderError, ValueError):
        raise HTTPException(502, 'Predictor unavailable or returned an incompatible response; no fallback was used')
