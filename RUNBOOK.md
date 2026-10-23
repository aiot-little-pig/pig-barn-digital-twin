# 로컬 실행 안내

최종 실행본 기준: 2026.10.14. Windows / Python 3.12 / Node 22 개발 환경에서 검증. 빌드된 화면 실행에는 Python 3.12만 필요하다. 공개 링크·실물 제어는 제공하지 않는다.

## 이미 설치된 이 PC

프로젝트 폴더에서 PowerShell을 열고 실행한다.

```powershell
.\start.cmd
```

`READY`가 표시되면 [디지털트윈](http://127.0.0.1:4173)을 연다. 실행한 터미널을 유지한다. 서버는 현재 PC의 127.0.0.1에만 열린다.

실행 명령은 `.\start.cmd`이며 끝에 `\`를 붙이지 않는다. API 준비 대기는 기본 90초이고 10초마다 진행 상황을 출력한다. 로딩이 느린 PC에서는 `.\start.cmd --startup-timeout 180`으로 늘릴 수 있다(5~600초). 이 값은 모델 추론 제한 시간이 아니라 서버 시작 대기 시간이다.

### API 시작 시간 초과 또는 빈 로그

실행기는 자식 Python을 띄우기 전에 `.runtime/api.log`에 실행 경로와 제한 시간을 기록한다. 자식은 출력 버퍼링 없이 Python 시작 → uvicorn 가져오기 → backend.app 가져오기 → 서버 준비 단계를 기록한다. 준비가 30초 이상 지연되면 현재 실행 위치도 남긴다. 직전 로그는 `.runtime/api.previous.log`로 보존한다.

- 실행기 정보만 있으면 자식 Python이 아직 작업 코드에 도달하지 못한 상태다.
- `importing ...`에서 멈추면 해당 라이브러리 또는 앱 로딩 중이다. 이어지는 진단 내용을 확인한다.
- `Application and listener ready`가 있는데 시간 초과라면 로컬 HTTP 연결을 확인한다. 실행기의 로컬 확인은 프록시를 사용하지 않는다.
- 자식이 종료되면 오류 메시지에 종료 코드를 표시한다. 로그의 마지막 예외와 함께 원인을 확인한다.

로그를 직접 확인할 명령은 `type .runtime\api.log`다. 로그가 여전히 0바이트라면 수정된 실행기를 사용하고 있는지 경로부터 확인한다. 같은 경로의 로그를 읽으면서 여러 실행기를 동시에 시작하지 않는다. 시작 실패 시에도 실행기는 자신이 시작한 API만 정리한다.

- 디지털트윈 → **예측 API 연결**: 기본 Mock 모델로 시작한다. 데이터는 합성 예시이며 예측은 현재값 유지 기준선이다.
- 시간 막대 30분으로 이동 → 시계열 분석: 00:00의 예측 10과 00:30 실제 24, 절대오차 14를 확인한다.
- 모델 검증: 예측 파일 업로드 후 농장·조건·평가 기간을 선택한다.
- 제어 시나리오: C1~C4 합성 실험을 실행한다. 실제 장치에 명령을 보내지 않는다.

다른 터미널에서 아래 명령을 실행한다.

```powershell
.\status.cmd
.\stop.cmd
```

시작 터미널의 Ctrl+C로도 종료할 수 있다. 종료기는 이 실행기가 띄운 API만 정리한다. 다른 서버가 8000/4173을 사용 중이면 시작을 거부하므로 기존 서버를 사용자가 확인한 뒤 종료한다. 이미 실행 중인 서버를 자동으로 강제 종료하지 않는다.

## 다른 PC에 설치

**GitHub clone / Code → Download ZIP으로 받은 소스:** Python 3.12와 Node.js 22를 설치하고 프로젝트 루트에서 `.\setup.cmd` → `.\start.cmd`를 실행한다. `dist`는 Git에서 제외하므로 빌드가 필요하다. [팀 저장소](https://github.com/aiot-little-pig/pig-barn-digital-twin)에서 받는다.

아래 절차는 `scripts/package_release.py`로 만든 **dist 포함 전달용 ZIP**에만 해당한다.

압축을 풀고 `barn-simulator` 폴더에서 Python 3.12가 설치되어 있는지 확인한다. 최초 설치에는 인터넷이 필요하다. Node 22는 소스 수정·재빌드 시에만 필요하다.

```powershell
py -3.12 -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
.\start.cmd
```

압축본에는 완성된 `dist`가 들어 있으므로 화면 실행에 Node 패키지 설치는 필요 없다. 소스를 수정하거나 다시 빌드할 때만 다음 명령을 실행한다.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
```

기존 서버를 종료하고 다시 시작한 뒤 브라우저를 새로고침한다. 가상환경은 PC 사이에 복사하지 않고 각 PC에서 설치한다. 새 PC의 의존성 설치 자체는 별도 환경에서 검증하지 않았다.

## 모델 공급자 변경

```powershell
.\stop.cmd
.\start.cmd --config launcher.local.json
```

`launcher.http.example.json` 또는 `launcher.file.example.json`을 `launcher.local.json`으로 복사해 수정한다. 토큰은 JSON에 넣지 않고 시작 터미널의 `PREDICTOR_TOKEN` 환경변수로 전달한다. 실행기는 `.env`를 자동 로딩하지 않는다. UI의 모델 ID/버전/조건도 제공 모델과 맞춘다. HTTP 예시 주소 9000에는 실제 모델 서버를 별도로 실행해야 한다.

화면의 API 주소는 항상 FastAPI `http://127.0.0.1:8000`을 가리킨다. 모델 서버 주소는 서버 설정에만 넣는다. 기본 UI 제한 시간은 8초이므로 이 실행기는 모델 서버 제한 시간을 최대 6초로 받는다. 장시간 추론은 최적화 또는 별도의 비동기 계약 설계가 필요하다.

File 예시는 계약 확인용이며 기본 3D 예시와 대상 ID·기준 시각이 다를 수 있다. 정확히 일치하는 저장 예측이 없으면 오류로 표시한다. 자동으로 Mock으로 대체하지 않는다.

## 문제 확인

| 상황 | 조치 |
| --- | --- |
| 8000/4173 사용 중 | 기존 개발 서버 또는 이전 시작 터미널 확인. 이 실행기가 만든 세션이면 stop.cmd |
| Python 환경 없음 | 위 최초 설치 절차 실행 |
| dist 없음 | npm ci, npm run build |
| API 시작 실패 | `.runtime/api.log` 확인 |
| 재부팅 후 오래된 세션 파일 | start.cmd로 새로 시작. stop/status가 연결 실패해도 타 프로세스는 종료하지 않음 |
| 예측 미수신 | API 주소·모델 ID·버전·조건·입력 데이터 확인 후 실패 예측 재시도 |
| 화면에 이전 버전 표시 | 서버 재시작 후 새로고침. 현재 화면은 서비스 워커를 사용하지 않음 |

프로세스를 강제로 종료했을 때 자식 API가 남을 수 있다. 기본 종료는 stop.cmd 또는 Ctrl+C를 사용한다. 현재 실행기는 OS 서비스나 자동 부팅 작업이 아니다.

## 패키지 검증

```powershell
.\backend\.venv\Scripts\python.exe -m unittest backend.test_app backend.test_predictors
.\backend\.venv\Scripts\python.exe scripts\package_release.py
```

`deliverables/barn-digital-twin-2026-10-14-team.zip`에 실행 안내·배포용 파일과 `MANIFEST.sha256.json` 해시 목록을 생성한다. `node_modules`, 가상환경, `.runtime`, 로컬 설정과 토큰은 포함하지 않는다.
