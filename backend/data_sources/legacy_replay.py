"""Explicit migration of replay-1 forecasts; actual/current are never model inputs here."""
from datetime import datetime, timedelta

from backend.schemas import PredictionArchive, PredictionResult


def convert_replay(input_data, *, dataset_version, subject_id, model_versions, observation_source):
    # Legacy files lack these metadata. Caller must supply them rather than infer them.
    if input_data.get('schema_version') != 'replay-1' or input_data.get('horizon_minutes') != 30:
        raise ValueError('Only replay-1 with a 30-minute horizon can be converted')
    if input_data.get('source') not in ('synthetic_fixture', 'model_output'):
        raise ValueError('Unknown legacy prediction source')
    records = []
    for i, row in enumerate(input_data['records']):
        issued = datetime.fromisoformat(row['observed_at'].replace('Z', '+00:00'))
        target = datetime.fromisoformat(row['target_at'].replace('Z', '+00:00'))
        if target != issued + timedelta(minutes=30):
            raise ValueError('Legacy target does not match horizon')
        has_interval = row['lower'] is not None or row['upper'] is not None
        records.append(PredictionResult(
            request_id=f'legacy-{i}', dataset_id=input_data['dataset_id'], dataset_version=dataset_version,
            farm_id=row['farm_id'], subject_id=subject_id, condition_id=row['condition_id'],
            model_id=row['model_id'], model_version=model_versions[row['model_id']],
            observation_source=observation_source, prediction_source=input_data['source'],
            unit=input_data['unit'], issued_at=issued, target_at=target,
            # Legacy format does not record compute time. Preserve explicit lack of provenance.
            generated_at=None,
            status='ok' if row['prediction'] is not None else 'unavailable',
            prediction=row['prediction'], lower=row['lower'], upper=row['upper'],
            nominal_coverage=input_data['nominal_coverage'] if has_interval else None,
            interval_method=input_data['interval_method'] if has_interval else None,
            message='Imported replay-1; original generation time was not recorded',
        ))
    return PredictionArchive(records=records)
