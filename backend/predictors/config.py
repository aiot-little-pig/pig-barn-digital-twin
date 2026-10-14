"""Server-side configuration; no endpoint/token is accepted from a browser request."""
import os

from .providers import FilePredictor, HttpPredictor, MockPredictor


def get_predictor():
    mode = os.getenv('PREDICTOR_MODE', 'mock')
    if mode == 'mock':
        return MockPredictor()
    if mode == 'file':
        return FilePredictor(os.environ['PREDICTOR_FILE'])
    if mode == 'http':
        return HttpPredictor(os.environ['PREDICTOR_URL'],
                             timeout=float(os.getenv('PREDICTOR_TIMEOUT_SECONDS', '5')),
                             token=os.getenv('PREDICTOR_TOKEN'))
    raise ValueError('PREDICTOR_MODE must be mock, file or http')
