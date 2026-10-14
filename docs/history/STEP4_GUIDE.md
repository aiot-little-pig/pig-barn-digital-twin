# 4단계 — FastAPI 응답을 R3F 화면에 연결하기

이번 단계는 Python 백엔드와 React 화면 사이의 통신·검증 경계를 만드는 작업입니다. **실제 FastAPI 서버를 호출하지만 반환 데이터는 C1~C4 합성 재생 결과입니다.** 학습 AI·센서 스트림·실물 제어 연결은 아직 없습니다.

## 1. 바로 확인하기

서버가 실행 중이면 기존 http://127.0.0.1:4173/ 탭을 새로고침하고 상단 **데이터 모드 → FastAPI 합성 재생**을 선택하세요. C4의 11분에서 현재 지수 약 0.187, 예측 약 0.651, 팬 85% / 1530 RPM, 스크러버 ON을 확인합니다. 이는 시연값입니다.

- 화면: http://127.0.0.1:4173/
- Swagger: http://127.0.0.1:8000/docs
- 샘플 응답: http://127.0.0.1:8000/api/v1/snapshot?scenario=C4&minute=11
- 상태 확인: http://127.0.0.1:8000/health

브라우저 합성 재생은 기존 계산을 화면 안에서 수행합니다. FastAPI 합성 재생은 선택 시각의 결과를 서버에서 가져옵니다. 현재 API에는 전체 곡선·이벤트 이력이 없으므로 서버 모드에서는 해당 패널을 합성 로컬 그래프로 대체하지 않습니다. 탐지 좌표도 응답에 없어서 검정 탐지 표식을 숨깁니다.

## 2. 다시 실행하는 방법

아래 명령의 작업 폴더는 `outputs/barn-simulator`입니다. 이미 생성된 backend/.venv를 사용하면 환경 생성·설치를 반복할 필요가 없습니다. 새 컴퓨터에서는 Python 3.12와 Node.js를 준비합니다.

```powershell
py -3.12 -m venv backend/.venv
./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
npm.cmd install
npm.cmd run export:demo
```

가상환경을 만들고 검증한 Python 의존성을 설치합니다. `export:demo`는 기존 JavaScript 시뮬레이션 결과를 `backend/demo_runs.json`으로 내보냅니다. Python에 같은 제어식을 복사하지 않아 두 구현의 계산이 달라지는 것을 피했습니다. 이미 JSON이 포함되어 있으므로 설정을 바꾸지 않았다면 내보내기는 생략할 수 있습니다. `requirements.txt`는 허용 범위, `requirements-lock.txt`는 이 환경에서 확인한 정확한 버전 목록입니다.

첫 번째 터미널에서 서버를 실행합니다.

```powershell
./backend/.venv/Scripts/python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

이 명령은 로컬 PC의 8000번 포트에서 FastAPI를 실행합니다. `backend.app:app`은 backend/app.py 안의 app 객체라는 뜻입니다. 종료는 해당 터미널에서 Ctrl+C입니다. 서버가 이미 실행 중이면 다시 실행하지 않습니다.

두 번째 터미널에서 화면을 실행합니다.

```powershell
npm.cmd run build
npm.cmd run preview
```

빌드된 React 앱을 4173번 포트에서 제공합니다. 기존 preview 서버가 열려 있다면 build 후 해당 탭만 새로고침하세요. 일반 개발 환경에서는 `npm.cmd run dev`도 가능하며, 현재 환경은 esbuild 상위 폴더 접근 제한이 있어 빌드 미리보기를 사용합니다.

**config.js의 돈사 크기·실험 설정을 바꿨다면:** `export:demo` → FastAPI 재시작 → 프론트엔드 build → 새로고침 순서로 양쪽을 동기화하세요. 서버는 시작할 때 JSON을 읽습니다. 돈사 크기가 다른 응답은 프론트엔드에서 거부합니다. 모델 파라미터 전체의 자동 버전 동기화까지 구현한 것은 아닙니다.

## 3. 응답 계약을 먼저 이해하기

Swagger의 Snapshot 스키마에 전체 필드가 있습니다. 다음은 각 필드의 의미입니다.

| 필드 | 의미와 규칙 |
| --- | --- |
| schema_version / source | 현재 `1.0` / `synthetic-replay`. 실제 AI 출처로 임의 표시하지 않음 |
| scenario / simulation_minute | 요청한 C1~C4와 모의 시각. 응답이 요청과 다르면 거부 |
| generated_at | 서버가 응답을 만든 UTC 시각 |
| data_at | 데이터 기준 시각. 현재 합성 예제에서는 응답 생성 시각과 같음 |
| forecast_for / horizon_minutes | data_at 이후 예측 대상 시각 / 간격. 두 값의 일치 확인 |
| unit | `relative_index`. ppm으로 해석하지 않음 |
| normalization | `demo-index-v1;heatmap-clipped-0-1`. 현재 합성 지수 정의 식별자 |
| current_index / predicted_index | 비음수 상대 지수 또는 null. 1 초과 원지수도 보존 |
| grid.values | 현재 상대 지수의 공간 표시 배열. 각 값 0~1 또는 null |
| grid.width_m / length_m | 화면 돈사의 폭·길이와 일치해야 함 |
| grid.rows / columns | 실제 배열 크기와 일치. 각각 최대 256 |
| grid.coordinates | `center-origin:column=+X,row=+Z`. 원점=바닥 중심 |
| grid.meaning | `current_relative_index`. 미래 예측 격자와 혼동하지 않도록 명시 |
| actuators | pwm_percent(0~100), rpm(비음수), scrubber_on(bool). 각각 null 허용 |
| reason | 현재 제어 판단의 설명 |

`grid.values[row][column]`에서 열이 증가하면 +X, 행이 증가하면 +Z입니다. 격자 범위는 X=-폭/2~폭/2, Z=-길이/2~길이/2입니다. 셀 중심에 색을 칠합니다. 실제 NH₃ 공간 확산을 계산한 배열은 아니며 합성 공간 가중치입니다.

원지수가 1.2라면 수치는 1.2를 표시하고 색상만 1에서 포화됩니다. null은 0과 다릅니다. null 셀은 회색, null 지수는 `—`, null 스크러버는 `미확인`입니다.

## 4. Python 코드 역할

```python
@app.get('/api/v1/snapshot', response_model=Snapshot)
def snapshot(response: Response, scenario: Scenario = 'C3',
             minute: float = Query(0, ge=0, allow_inf_nan=False)):
    response.headers['Cache-Control'] = 'no-store'
    return build_snapshot(scenario, minute)
```

이 경로가 프론트엔드의 GET 요청을 받습니다. FastAPI가 scenario와 minute을 검증하고, `Snapshot` 응답 모델로 필드와 범위를 검증합니다. `no-store`는 이전 응답을 캐시에서 읽지 않게 합니다. minute은 내보낸 기간과 stepMinutes 격자에 맞아야 합니다. [FastAPI 응답 모델 문서](https://fastapi.tiangolo.com/tutorial/response-model/)

`build_snapshot`은 현재 JSON에서 해당 프레임을 선택하고 공간 가중치에 현재 지수를 곱해 격자를 만듭니다. 시간 필드는 UTC로 생성합니다. **앞으로 Python 예측 파이프라인을 연결할 공급 함수가 이 함수입니다.** 지금은 Python에서 새로운 예측을 수행하지 않습니다.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f'http://{host}:{port}'
                   for host in ('127.0.0.1', 'localhost')
                   for port in (4173, 5173)],
    allow_methods=['GET'], allow_headers=['Accept'], allow_credentials=False,
)
```

화면과 API는 포트가 달라 다른 origin입니다. 이 설정은 개발 화면 주소에서 응답을 읽도록 허용합니다. 포트를 바꾸면 목록도 수정하세요. CORS는 사용자 인증이나 실물 장치 접근 제어 기능이 아닙니다. 현재 서버는 로컬 주소에만 바인딩하며 GET만 제공합니다. [FastAPI CORS 문서](https://fastapi.tiangolo.com/tutorial/cors/)

## 5. React 코드 역할

```jsx
const api = useApiSnapshot(serverMode, scenario, localFrame.time);
const usable = !!api.data && !api.stale && !api.error;
const frame = serverMode
  ? (usable ? frameFromSnapshot(api.data) : UNKNOWN_FRAME)
  : localFrame;
```

`useApiSnapshot`은 네트워크 요청의 생명주기를 맡는 커스텀 훅입니다. 유효한 응답만 `frameFromSnapshot`으로 변환해 기존 3D 컴포넌트에 전달합니다. 통신 로직을 돈사 모형 안에 넣지 않았으므로 Barn과 HeatmapFloor는 데이터 공급 방식에 크게 의존하지 않습니다.

```js
const response = await fetch(url, {
  signal: controller.signal,
  cache: 'no-store',
  headers: { Accept: 'application/json' },
});
const data = validateSnapshot(await response.json(), scenario, minute);
```

`AbortController`는 시나리오나 시간이 바뀌면 이전 요청을 중단합니다. 별도의 취소 플래그도 검사하여 늦은 응답이 새 화면을 덮지 않게 합니다. `validateSnapshot`은 단위·좌표·크기·시각·장치 값까지 확인합니다. 잘못된 응답은 3D에 보내지 않습니다.

같은 시점에서는 요청 완료 후 1초 뒤 다시 조회합니다. 요청 중복을 막는 순차 폴링입니다. 모의 시각이 바뀌면 즉시 새 요청을 보내므로 고배속 재생은 초당 요청 수가 늘어납니다. 빠른 화면 갱신이 필요하면 이후 스트리밍이나 별도의 데이터 갱신 주기를 설계할 수 있습니다. 이번 단계는 흐름을 이해하기 쉬운 GET 방식입니다.

| 상황 | 화면 처리 |
| --- | --- |
| 첫 요청·시나리오 변경·시간 이동 | 새 응답 대기. 이전 시점 값을 현재값으로 표시하지 않음 |
| 정상 응답 | 서버 격자·지수·장치 상태 표시 |
| 일부 null | 해당 항목만 회색/—/미확인. 나머지는 표시 |
| HTTP 오류·잘못된 JSON·계약 오류·4초 초과 | 전체 서버 상태를 사용 불가로 표시하고 재시도 |
| data_at이 현재보다 10초 이상 오래됨 | 오래된 데이터 표시, 상태·격자 사용 중단 |
| 연결 복구 | 다음 유효 응답으로 자동 회복 |
| 브라우저 모드로 직접 변경 | 로컬 합성 재생으로 돌아감 |

경계에서 정확히 10초까지는 허용하며 10초를 초과하면 오래된 것으로 판정합니다. 브라우저 시계로 검사하므로 실제 서버 연결에서는 시계 동기화가 필요합니다. 서버의 생성 시각만 최신으로 바꿔도 오래된 데이터가 신선해지지 않도록 data_at을 기준으로 검사합니다. 현재 합성 데이터의 신선도는 실제 센서 최신성을 뜻하지 않습니다.

## 6. 직접 바꿀 설정

| 위치 | 변수 | 기본값 / 역할 |
| --- | --- | --- |
| .env.local | VITE_API_BASE_URL | `http://127.0.0.1:8000`. .env.example을 복사해 변경 후 다시 빌드 |
| src/apiContract.js | API.pollMs | 1000ms. 같은 시점에서 요청 완료 후 재조회 간격 |
| src/apiContract.js | API.timeoutMs | 4000ms. 요청 제한시간 |
| src/apiContract.js | API.staleMs | 10000ms. data_at 허용 나이 |
| src/apiContract.js | API.futureToleranceMs | 5000ms. 서버 생성 시각의 미래 오차 허용 |
| backend/app.py | allow_origins | 화면을 실행하는 주소와 포트 |
| src/config.js | SIMULATION / BARN / HEATMAP | 기존 실험·공간·색상 설정. 변경 후 재내보내기 필요 |

VITE_로 시작하는 환경변수는 브라우저 번들에 포함됩니다. API URL 설정에 사용하며 비밀 키를 넣지 않습니다.

## 7. 실제 Python 예측 모델로 넘어갈 때

아직 실제 모델 파일이나 센서 데이터 규격을 받지 않았으므로 이번에는 합성 데이터 공급기까지만 구현했습니다. 다음 연결 작업에서는 아래 계약을 확정해야 합니다.

1. `build_snapshot`을 데이터 저장소·모델 출력으로 연결합니다. 실제 수집 시각을 data_at에 유지하고, 응답마다 최신 시각으로 덮어쓰지 않습니다.
2. 실제 출력이 ppm이라면 단위·정규화 정의를 새로 정하고 양쪽 스키마와 범례를 함께 변경합니다. 현재 클라이언트는 ppm과 새로운 source를 의도적으로 거부합니다.
3. 실시간 모드에서는 scenario/minute 재생 쿼리 대신 실제 돈사 ID·관측 시각을 기준으로 공급하도록 API를 분리합니다. 현재 인터페이스는 재생용입니다.
4. 격자가 모델에서 직접 나오지 않으면 보간/공간 배분 가정과 실제 예측값을 구분합니다. scalar 예측을 임의로 실제 공간 예측이라고 표시하지 않습니다.
5. 현재 API는 읽기 전용입니다. 팬 제어 명령과 장치 응답 확인은 별도의 제어 계약이 필요합니다.

## 8. 검증

```powershell
npm.cmd test
./backend/.venv/Scripts/python.exe -m unittest backend.test_app -v
npm.cmd run build
```

JavaScript 테스트 10개(기존 시뮬레이션 6개 + API 계약 4개), Python API 테스트 4개가 통과했습니다. Python 테스트 안에서 C1~C4 및 여러 시각의 응답을 내보낸 데이터와 비교합니다. 브라우저에서는 실제 FastAPI 연결, C4 상태, 결측, 오래된 응답, 잘못된 단위, 연결 중단·복구, 늦은 이전 응답, 모드 변경, 재생, 모바일 가로 넘침을 확인했습니다.

빌드는 성공했으며 기존 큰 JavaScript 번들 경고는 남아 있습니다. 현재 설치 조합은 Starlette TestClient에서 httpx 사용에 관한 향후 지원 중단 경고를 내지만 테스트는 통과합니다. 이번 단계에서 실제 AI 정확도나 농장 제어 성능을 검증한 것은 아닙니다.
