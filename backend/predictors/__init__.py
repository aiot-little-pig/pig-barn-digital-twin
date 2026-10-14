"""All providers expose predict(PredictionRequest) -> PredictionResult."""
from .providers import FilePredictor, HttpPredictor, MockPredictor, Predictor, ProviderError

__all__ = ['FilePredictor', 'HttpPredictor', 'MockPredictor', 'Predictor', 'ProviderError']
