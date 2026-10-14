from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

import httpx
from pydantic import ValidationError

from backend.schemas import (PredictionArchive, PredictionRequest, PredictionResult,
                             identity, validate_match)


class Predictor(Protocol):
    def predict(self, request: PredictionRequest) -> PredictionResult: ...


class ProviderError(Exception):
    """Safe error message; upstream response bodies and credentials are never exposed."""


def result_for(request, source, status, **values):
    return PredictionResult(
        **identity(request), request_id=request.request_id, prediction_source=source,
        target_at=request.issued_at + timedelta(minutes=request.horizon_minutes),
        generated_at=datetime.now(timezone.utc), status=status, **values,
    )


class MockPredictor:
    """Persistence baseline for plumbing, not a trained AI or calibrated interval."""
    def predict(self, request):
        if (request.model_id, request.model_version) != ('mock-persistence', '1'):
            raise ProviderError('Mock provider requires model_id=mock-persistence and model_version=1')
        # Do not silently carry a stale value over a missing current sample.
        current = request.history[-1] if request.history else None
        if current is None or current.observed_at != request.issued_at or current.nh3 is None:
            return result_for(request, 'mock', 'insufficient_input', message='Current NH3 observation is missing')
        return result_for(request, 'mock', 'ok', prediction=current.nh3)


class FilePredictor:
    def __init__(self, path: str | Path):
        archive = PredictionArchive.model_validate_json(Path(path).read_text(encoding='utf-8-sig'))
        self.records = {tuple(identity(row).values()): row for row in archive.records}

    def predict(self, request):
        row = self.records.get(tuple(identity(request).values()))
        if row is None:
            # No invented prediction/source when a requested record is absent.
            raise ProviderError('No matching forecast in the configured archive')
        return validate_match(request, row.model_copy(update={'request_id': request.request_id}))


class HttpPredictor:
    def __init__(self, url: str, timeout: float = 5, token: str | None = None, transport=None):
        parsed = httpx.URL(url)
        if parsed.scheme not in ('http', 'https') or not parsed.host or parsed.username or parsed.password:
            raise ValueError('Predictor URL must be an HTTP(S) endpoint without embedded credentials')
        if not 0 < timeout <= 60:
            raise ValueError('Predictor timeout must be greater than 0 and at most 60 seconds')
        self.url, self.timeout, self.token, self.transport = url, timeout, token, transport

    def predict(self, request):
        headers = {'Authorization': f'Bearer {self.token}'} if self.token else {}
        try:
            with httpx.Client(timeout=self.timeout, transport=self.transport, follow_redirects=False) as client:
                response = client.post(self.url, json=request.model_dump(mode='json'), headers=headers)
                response.raise_for_status()
                result = PredictionResult.model_validate(response.json())
                return validate_match(request, result)
        except httpx.TimeoutException as exc:
            raise ProviderError('Model API timed out') from exc
        except (httpx.HTTPError, ValidationError, ValueError) as exc:
            raise ProviderError('Model API connection or response contract failed') from exc
