# Pig Barn Digital Twin · 아기데지

돈사 내부 NH₃ 관측과 30분 예측을 3D로 보고, 시간 재생·모델 비교·가상 환기 제어를 확인하는 팀 프로젝트입니다.

**처음 실행한다면 [팀 보고 및 화면 안내](TEAM_IMPLEMENTATION_BRIEF.md)를 함께 읽어주세요.** 기본 실행은 합성 관측과 Mock 예측입니다. 실제 학습 모델·현장 제어 효과는 별도 검증 대상입니다.

## 빠른 시작 · Windows

필수: **Git, Python 3.12, Node.js 22**, 최초 설치 시 인터넷 연결.

```powershell
git clone https://github.com/tangerineYR/pig-barn-digital-twin.git
cd pig-barn-digital-twin
.\setup.cmd
.\start.cmd
```

`setup.cmd`가 Python 환경·패키지와 화면 빌드를 준비합니다. `READY` 후 [http://127.0.0.1:4173](http://127.0.0.1:4173)을 열고 **예측 API 연결**을 누릅니다. 시작 터미널은 열어 두세요. 종료는 Ctrl+C 또는 다른 터미널에서 `.\stop.cmd`, 상태 확인은 `.\status.cmd`입니다.

Git 없이 **Code → Download ZIP**으로 받은 경우 압축을 풀고 `setup.cmd`가 있는 폴더에서 같은 순서로 실행합니다. GitHub 소스에는 `dist`가 없으므로 최초 빌드가 필요합니다.

## 화면과 기능

| 화면 | 역할 |
| --- | --- |
| 디지털트윈 | 농장·센서별 현재값, +30분 예측·구간, 3D 표시와 Replay |
| 모델 검증 | 같은 평가 표본에서 모델 조건별 오차·구간 포함률·폭 비교 |
| 제어 시나리오 | C1 무환기 / C2 사후 강화 / C3 선제 강화 / C4 선제 강화+배기 세정 |
| API 모니터 | 합성 시나리오의 서버 통신 확인 |

센서 수신 경로도 Mock으로 확인할 수 있습니다. 서버 실행 후 별도 터미널에서 아래 명령을 실행하고, **관측 데이터 가져오기 → 센서 수신 기록 불러오기**에서 `SENSOR-MOCK` / `1`을 선택합니다.

```powershell
.\backend\.venv\Scripts\python.exe scripts\send_observations.py
```

수신 기록은 `.runtime`에 저장하며 Git에 올리지 않습니다. 버튼으로 기록을 가져와 재생하며 자동 실시간 구독은 아닙니다.

## 저장소 구조

```text
src/                  React 화면·R3F 돈사·Replay·가상 제어
backend/              FastAPI·예측 공급자·관측 로더·수신 저장소
tests/                프론트 데이터·제어 로직 테스트
examples/             합성 시연 자료·연결 양식
scripts/              실행기·데이터 송신·내보내기·패키징
docs/history/         이전 보고서 (현재 사용법은 루트 문서 참고)
docs/archive/         초기 기획 보관본
.github/workflows/    push/PR 자동 테스트·빌드 설정
setup.cmd             최초 설치·화면 빌드
start/status/stop.cmd  로컬 시작·상태 확인·종료
```

`node_modules`, Python 가상환경, `dist`, 로그·수신 DB·개인 설정은 저장소에서 제외합니다. 중단한 임시 공유 서버·메뉴 제한 모드는 제거했고, 현재 사용하는 v1 합성 API와 파일 호환 어댑터는 유지합니다.

## 팀 작업과 검증

업데이트 시 서비스를 종료하고 `git pull --ff-only` 후 `.\setup.cmd`를 다시 실행합니다. 수정 작업은 별도 브랜치와 PR로 검토합니다. 모델 토큰은 서버 환경변수로 설정하고 실제 농장 자료는 Git 제외된 `data/`에 보관합니다.

```powershell
npm.cmd test
.\backend\.venv\Scripts\python.exe -m unittest backend.test_app backend.test_predictors backend.test_telemetry
npm.cmd run build
.\backend\.venv\Scripts\python.exe scripts\check_docs.py
```

GitHub Actions에도 동일한 테스트·빌드·문서 링크 점검을 설정했습니다. 원격 실행 결과는 저장소 Actions에서 확인합니다.

## 문서

- [팀 보고·화면 사용법](TEAM_IMPLEMENTATION_BRIEF.md)
- [설치·실행·오류 확인](RUNBOOK.md)
- [실제 구조 근거·센서/CSV 연결](FIELD_STRUCTURE_AND_SENSOR_GUIDE.md)
- [모델 담당자 인계](MODEL_HANDOFF.md)
- [개념과 설계 학습 · Phase 1](PHASE1_UNDERSTANDING_GUIDE.md)

3D 치수와 센서 위치는 가정이며 히트맵은 CFD가 아닙니다. C3와 C4의 실내 곡선은 같고 C4는 배출측 처리만 추가합니다. 실제 모델의 유용성은 독립 평가 데이터와 농장별 비교로 검증해야 합니다.
