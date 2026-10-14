# 예측 공급자 연결 안내

기존 `/api/v1/snapshot`은 C1~C4 합성 시연용으로 유지한다. 새 `POST /api/v2/predict`는 관측 이력을 받아 +30분 예측을 반환한다. 장치 명령은 보내지 않는다. React의 디지털트윈 화면에서 관측과 예측을 함께 표시한다.

통합 실행은 프로젝트 루트의 `start.cmd`를 사용한다. [로컬 실행 안내](../RUNBOOK.md)를 먼저 참고한다. 아래는 개발용 수동 실행이며 통합 실행과 동시에 실행하지 않는다.

## 실행과 확인

저장소 루트 폴더에서 실행한다. 이미 실행 중인 서버가 있다면 종료한 뒤 재실행한다.

```powershell
$env:PREDICTOR_MODE = 'mock'
.\backend\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Mock은 현재 NH₃를 +30분 예측값으로 그대로 유지하는 연결 점검용 기준선이다. 현재 시각의 값이 결측이면 `insufficient_input`을 반환한다. 예측구간은 만들지 않는다.

다른 터미널에서 같은 프로젝트 폴더를 열어 호출한다.

```powershell
$predictionBody = Get-Content -Raw -Encoding UTF8 examples/prediction-request-SYNTHETIC.json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v2/predict' -ContentType 'application/json' -Body $predictionBody
```

예시의 00:10 현재값은 12이고, 00:40 예측은 12 ppm이다. 이 값은 **합성 입력에 대한 단순 유지 예측**이다. 예시 관측 파일의 00:40 실제값 18은 요청에 포함되지 않는다. Swagger `/docs`에서도 같은 JSON을 붙여 넣어 확인할 수 있다.

## 공급자 교체

환경변수는 서버를 실행할 터미널에서 설정한다. `.env` 파일 자동 로딩은 구현하지 않았으며, 토큰을 프론트 설정이나 저장소에 적지 않는다.

| 모드 | 서버 환경변수 | 요청의 모델 식별자 |
| --- | --- | --- |
| Mock | `PREDICTOR_MODE=mock` | `mock-persistence`, 버전 `1` |
| 저장 파일 | `PREDICTOR_MODE=file`, `PREDICTOR_FILE=examples/predictions-SYNTHETIC.json` | 파일에 기록된 모델/버전/조건과 동일 |
| 실제 API | `PREDICTOR_MODE=http`, `PREDICTOR_URL`에 정확한 POST URL | 실제 모델 계약의 모델/버전 |

HTTP의 선택 설정은 `PREDICTOR_TIMEOUT_SECONDS`(기본 5, 최대 60초), `PREDICTOR_TOKEN`(Bearer 인증)이다. 요청은 표준 JSON을 POST하고 표준 응답을 받는다. 파일의 상대 경로는 서버 실행 폴더 기준이다. 실제 API가 다른 규격이면 `predictors/providers.py`의 `HttpPredictor`에서 매핑한다.

공급자와 모델 식별자는 별개다. File/HTTP로 Mock 결과를 전달해도 출처는 계속 `mock`이다. 학습 결과에는 `model_output`, 구간 UI 점검용 가짜 결과에는 `synthetic_fixture`를 사용한다.

## 데이터와 검증 규칙

| 파일/모듈 | 역할 |
| --- | --- |
| `schemas.py` | 공통 요청·응답·예측 파일 계약. 시각·단위·상태·구간 유효성 검사 |
| `predictors/providers.py` | Mock/File/HTTP 공급자와 응답의 요청 일치 검사 |
| `predictors/config.py` | 서버 환경변수로 공급자 선택 |
| `data_sources/observations.py` | 단일 농장·대상 관측 JSON/CSV 로드, 정렬, 기준 시각까지의 이력 추출 |
| `data_sources/legacy_replay.py` | 기존 `replay-1` 예측을 새 보관 규격으로 변환 |
| `../examples/*-SYNTHETIC.json` | 실제 학습 결과와 구분되는 형식·연결 확인용 예시 |

- 요청에 데이터셋/버전·농장·대상·조건·모델/버전·관측 출처·단위·기준 시각·이력을 담는다. +30분 이외 horizon은 이번 계약에서 받지 않는다.
- 이력 시각은 시간대를 포함하고 중복 없이 오름차순이어야 한다. 미래 관측과 `actual` 필드는 거부한다. 관측값은 비음수 유한 수 또는 null, 추가 입력 변수는 `features`에 넣는다.
- 원본 예측/구간은 음수 하한이 있더라도 보존한다. 위험 색상이나 물리적 유효성 정책은 후속 표시 단계에서 구별하며 평가 원본을 덮어쓰지 않는다.
- 구간은 하한·상한·목표 포함률·산출법을 모두 제공하거나 모두 null로 둔다. 목표 포함률은 정확도가 아니다. `generated_at`은 생성 시각을 알 수 없는 구형 파일에서 null일 수 있다.
- 파일 공급자는 농장·대상·시각·모델·단위 등의 정확한 일치로 조회한다. 새 요청 ID로 응답하되 저장된 예측값·생성 시각은 바꾸지 않는다.
- HTTP 응답의 요청 ID·모델·단위·시각 등이 다르면 실패로 처리한다. 입력 오류는 422, 서버 설정 오류는 503, 공급자 실패는 502이며 Mock으로 자동 대체하지 않는다.
- 역사 관측 시각과 네트워크 응답 시각은 별개다. 새 계약은 과거 데이터에 기존 v1의 실시간 신선도 규칙을 적용하지 않는다.

CSV는 시간·NH₃ 두 열의 명시적 매핑을 지원한다. 부가 입력 CSV 매핑은 모델 명세에 맞춰 확장하며 현재는 JSON `features`를 사용한다. 빈 값은 null, 중복·단위 추측·자동 보간은 허용하지 않는다. JSON/CSV 관측 저장소는 이 단계에서 Python 모듈로 제공하며 브라우저 업로드 API는 아직 없다.

기존 `replay-1` 변환에는 빠진 메타정보인 데이터 버전·관측 대상·모델 버전 매핑·관측 출처를 호출자가 제공해야 한다. `current`/`actual`을 임의로 하나의 관측 시계열로 합치지 않고 예측만 변환한다. 원래 파일은 기존 브라우저 사후 평가 화면에서 계속 사용할 수 있다.

## 모델 담당자에게 받을 정보

입력 변수와 단위, 입력 창 길이/샘플 간격/전처리, 모델 ID/버전과 조건, API 요청·응답 예시 또는 저장된 출력 파일, 구간 산출법·목표 포함률을 받는다. 입력 창·결측 허용 규칙을 결정하는 일은 실제 모델 명세에 따른다. 연결 코드는 마련했지만 실제 학습모델 연결·성능 검증은 아직 수행하지 않았다.

## 검증 명령

```powershell
.\backend\.venv\Scripts\python.exe -m unittest backend.test_app backend.test_predictors -v
npm.cmd test
```

테스트는 기존 합성 API, 미래정보 차단, 결측·구간·파일 매칭, 실제 로컬 HTTP 테스트 서버를 통한 공급자 교체, 타임아웃·잘못된 응답·CORS를 확인한다. HTTP 테스트 서버는 테스트 종료 시 닫힌다.
