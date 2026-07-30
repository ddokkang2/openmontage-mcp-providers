# OpenMontage + MCP Provider 설치·사용 매뉴얼

Windows 11 PowerShell과 macOS Terminal(zsh)을 모두 다루는 한국어 실전 안내서입니다.

![OpenMontage MCP manual cover](images/openmontage-mcp-manual/cover.png)

이 매뉴얼은 다음 작업을 한 번에 연결합니다.

1. 원하는 작업 폴더에 OpenMontage와 이 브리지를 설치합니다.
2. Kling, Magnific, Higgsfield 또는 BBANANA MCP를 인증합니다.
3. OpenMontage가 기획하고 선택한 MCP가 미디어를 생성하게 합니다.
4. 생성 전 모델·옵션·예상 비용을 확인하고 사용자가 승인합니다.
5. 생성 결과를 OpenMontage `asset_manifest`로 돌려보냅니다.

> 이 브리지는 provider를 자동으로 바꾸지 않습니다. 실패 또는 timeout이 발생해도
> 자동 재제출하지 않습니다. 유료 생성에는 `--yes`와 명시적인 비용 승인값이
> 필요합니다.

---

## 1. 전체 구조

![OpenMontage MCP architecture](images/openmontage-mcp-manual/01-architecture.png)

| 구성 요소 | 담당 역할 |
|---|---|
| OpenMontage | 아이디어 분석, 대본, 장면계획, 프롬프트, 편집, 자막, 음악, 렌더링 |
| openmontage-mcp-providers | MCP 인증, 도구·모델·비용 조회, 생성 요청, 상태 조회, 결과 다운로드 |
| Kling·Magnific·Higgsfield·BBANANA | 실제 이미지·영상 생성 및 후처리 |

```text
사용자 요청
  → OpenMontage scene_plan
  → MCP 모델·옵션·비용 조회
  → 사용자 승인
  → 선택한 MCP에서 생성
  → 결과 파일 다운로드
  → OpenMontage asset_manifest
  → 편집·자막·음악·최종 렌더링
```

---

## 2. 공통 준비물

- Git
- Python 3.10 이상
- Node.js 20 이상
- FFmpeg
- Codex, Claude Code, Cursor 등 파일을 읽고 명령을 실행할 수 있는 AI 코딩 도구

OpenMontage 자체는 Node.js 18 이상을 지원하지만 이 브리지는 Node.js 20 이상을
요구하므로, 전체 환경에서는 Node.js 20 이상을 사용하세요.

### Windows 확인

```powershell
git --version
py --version
node --version
npm.cmd --version
ffmpeg -version
```

### macOS 확인

```bash
git --version
python3 --version
node --version
npm --version
ffmpeg -version
```

macOS에서 Homebrew를 사용한다면 필요한 도구를 다음처럼 설치할 수 있습니다.

```bash
xcode-select --install
brew install git python@3.11 node ffmpeg
```

`xcode-select --install`이 이미 완료된 Mac에서는 설치 완료 안내가 표시될 수 있습니다.

---

## 3. 작업 폴더 선택

OneDrive나 iCloud Drive를 사용할 필요가 없습니다. 원하는 로컬 경로를 직접
지정할 수 있습니다. 두 저장소를 같은 상위 폴더에 두면 브리지 경로가 자동으로
연결됩니다.

### Windows

```powershell
$WorkRoot = "D:\AI-Video"
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null
Set-Location $WorkRoot
```

### macOS

```bash
export WORK_ROOT="$HOME/AI-Video"
mkdir -p "$WORK_ROOT"
cd "$WORK_ROOT"
```

예상 구조:

```text
AI-Video/
├── OpenMontage/
└── openmontage-mcp-providers/
```

---

## 4. 저장소 복제

### Windows

```powershell
Set-Location $WorkRoot
git clone https://github.com/calesthio/OpenMontage.git
git clone https://github.com/ddokkang2/openmontage-mcp-providers.git
```

### macOS

```bash
cd "$WORK_ROOT"
git clone https://github.com/calesthio/OpenMontage.git
git clone https://github.com/ddokkang2/openmontage-mcp-providers.git
```

---

## 5. OpenMontage 설치

OpenMontage의 최신 기본 설치 경로는 `make setup`입니다. Windows에는 `make`가
없는 경우가 많으므로 수동 설치 명령도 함께 제공합니다.

### Windows PowerShell

```powershell
Set-Location "$WorkRoot\OpenMontage"

py -3.11 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

Set-Location remotion-composer
npm.cmd install
Set-Location ..

python -m pip install piper-tts

if (!(Test-Path .env)) {
  Copy-Item .env.example .env
}
```

Python 3.11 실행기가 없다면 `py -3.11` 대신 `py -3`을 사용하세요.

### macOS Terminal

권장:

```bash
cd "$WORK_ROOT/OpenMontage"
make setup
```

`make`를 사용하지 않는 수동 설치:

```bash
cd "$WORK_ROOT/OpenMontage"

python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

cd remotion-composer
npm install
cd ..

python -m pip install piper-tts

test -f .env || cp .env.example .env
```

### 설치 확인

Windows:

```powershell
python -c "import pydantic; print('Python dependencies: OK')"
ffmpeg -version
```

macOS:

```bash
python -c "import pydantic; print('Python dependencies: OK')"
ffmpeg -version
```

---

## 6. MCP 브리지 설치

### Windows

```powershell
Set-Location "$WorkRoot\openmontage-mcp-providers"
npm.cmd install
node src\cli.js providers
```

### macOS

```bash
cd "$WORK_ROOT/openmontage-mcp-providers"
npm install
node src/cli.js providers
```

정상이라면 다음 provider ID가 표시됩니다.

```text
bbanana
higgsfield
kling
magnific
```

---

## 7. OpenMontage에 provider shim 설치

먼저 `--dry-run`으로 변경 대상을 확인하고, 문제가 없을 때만 `--yes`로 설치합니다.

### Windows

```powershell
node src\cli.js install-openmontage `
  --path "$WorkRoot\OpenMontage" `
  --providers all `
  --dry-run

node src\cli.js install-openmontage `
  --path "$WorkRoot\OpenMontage" `
  --providers all `
  --yes
```

### macOS

```bash
node src/cli.js install-openmontage \
  --path "$WORK_ROOT/OpenMontage" \
  --providers all \
  --dry-run

node src/cli.js install-openmontage \
  --path "$WORK_ROOT/OpenMontage" \
  --providers all \
  --yes
```

설치되는 OpenMontage 도구:

```text
tools/video/_mcp_video_base.py
tools/video/kling_mcp_video.py
tools/video/magnific_mcp_video.py
tools/video/higgsfield_mcp_video.py
tools/video/bbanana_mcp_video.py
```

기존 파일은 자동으로 덮어쓰지 않습니다.

### 두 저장소가 서로 다른 위치에 있을 때

Windows 현재 세션:

```powershell
$env:OPENMONTAGE_MCP_BRIDGE_CLI = (
  Resolve-Path "$WorkRoot\openmontage-mcp-providers\src\cli.js"
).Path
```

Windows 사용자 환경변수:

```powershell
[Environment]::SetEnvironmentVariable(
  "OPENMONTAGE_MCP_BRIDGE_CLI",
  (Resolve-Path "$WorkRoot\openmontage-mcp-providers\src\cli.js").Path,
  "User"
)
```

macOS 현재 세션:

```bash
export OPENMONTAGE_MCP_BRIDGE_CLI="$WORK_ROOT/openmontage-mcp-providers/src/cli.js"
```

macOS에서 계속 사용하려면 `~/.zshrc`에 위 `export` 한 줄을 추가한 뒤 새 Terminal을
열거나 다음을 실행합니다.

```bash
source ~/.zshrc
```

이 변수는 비밀값이 아니라 로컬 파일 경로입니다.

---

## 8. OAuth provider 인증

인증 명령은 `openmontage-mcp-providers` 폴더에서 실행합니다. 브라우저가 열리면
각 서비스에 로그인하고 접근 권한을 승인하세요.

### Kling

Windows:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://kling.ai/mcp
node src\cli.js doctor --provider kling
```

macOS:

```bash
npx -p mcp-remote@latest mcp-remote-client https://kling.ai/mcp
node src/cli.js doctor --provider kling
```

### Magnific

Windows:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://mcp.magnific.com
node src\cli.js doctor --provider magnific
```

macOS:

```bash
npx -p mcp-remote@latest mcp-remote-client https://mcp.magnific.com
node src/cli.js doctor --provider magnific
```

### Higgsfield

Windows:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://mcp.higgsfield.ai/mcp
node src\cli.js doctor --provider higgsfield
```

macOS:

```bash
npx -p mcp-remote@latest mcp-remote-client https://mcp.higgsfield.ai/mcp
node src/cli.js doctor --provider higgsfield
```

OAuth 캐시나 `.mcp-auth` 내용은 복사하거나 Git에 커밋하지 마세요.

---

## 9. BBANANA 토큰 설정

토큰 값은 `providers/bbanana.json`, `.env`, Markdown, 예제 파일에 넣지 않습니다.
브리지는 `BBANANA_MCP_TOKEN`이라는 환경변수 이름만 저장합니다.

### Windows — 현재 PowerShell 세션

```powershell
$env:BBANANA_MCP_TOKEN = "YOUR_BBANANA_TOKEN"
node src\cli.js doctor --provider bbanana
```

현재 세션을 닫으면 값이 사라지는 방식이므로 처음 설정할 때 권장합니다.

사용자 환경변수로 저장하려면:

```powershell
[Environment]::SetEnvironmentVariable(
  "BBANANA_MCP_TOKEN",
  "YOUR_BBANANA_TOKEN",
  "User"
)
```

저장 후 새 PowerShell 또는 새 Codex 작업을 여세요. 공유 PC에서는 사용자
환경변수에 평문 토큰을 저장하지 말고 세션 변수만 사용하세요.

### macOS — 현재 zsh 세션

화면에 토큰을 표시하지 않고 입력합니다.

```bash
read -s "BBANANA_MCP_TOKEN?BBANANA token: "
export BBANANA_MCP_TOKEN
echo
node src/cli.js doctor --provider bbanana
```

### macOS — Keychain 사용

토큰을 `~/.zshrc`에 평문으로 쓰지 않으려면 macOS Keychain을 권장합니다.

최초 1회 저장합니다. 토큰은 화면과 셸 기록에 표시되지 않지만, 저장 명령을
실행하는 동안 현재 셸 변수에는 존재합니다.

```bash
read -s "BBANANA_MCP_TOKEN?BBANANA token: "
echo
security add-generic-password \
  -U \
  -a "$USER" \
  -s "BBANANA_MCP_TOKEN" \
  -w "$BBANANA_MCP_TOKEN"
```

현재 Terminal에 불러오기:

```bash
export BBANANA_MCP_TOKEN="$(
  security find-generic-password \
    -a "$USER" \
    -s "BBANANA_MCP_TOKEN" \
    -w
)"
```

원한다면 위 `export` 블록만 `~/.zshrc`에 추가할 수 있습니다. 실제 토큰 값은
Keychain에 남고 셸 설정 파일에는 기록되지 않습니다.

---

## 10. 인증 완료 확인

서버 추가 또는 `doctor` 성공 메시지만으로 생성 준비가 끝났다고 판단하지 마세요.
다음 세 단계를 확인합니다.

1. `doctor`: 연결과 도구 스키마 확인
2. `tools` 또는 `catalog`: 실제 도구·모델 노출 확인
3. provider 고유 읽기 전용 호출: 계정 연결 확인

### Windows

```powershell
node src\cli.js doctor --provider bbanana
node src\cli.js tools --provider bbanana
node src\cli.js catalog --provider bbanana
node src\cli.js call `
  --provider bbanana `
  --tool check_credits `
  --args '{}'
```

### macOS

```bash
node src/cli.js doctor --provider bbanana
node src/cli.js tools --provider bbanana
node src/cli.js catalog --provider bbanana
node src/cli.js call \
  --provider bbanana \
  --tool check_credits \
  --args '{}'
```

`check_credits`가 실제 숫자를 반환해야 BBANANA 토큰이 해당 계정에 연결된
것입니다. 오류가 나면 토큰을 다시 제출하거나 새 Terminal/Codex 작업을 연 뒤
재확인하세요.

OAuth provider도 최소한 `doctor`와 `catalog` 또는 `tools`를 모두 확인하세요.

---

## 11. 모델과 비용 확인

BBANANA:

```bash
node src/cli.js catalog --provider bbanana
```

출력에서 다음 값을 함께 확인합니다.

- 정확한 `service_name`
- `tier`
- `duration`
- `resolution`
- `credit_map` 또는 `credit_cost`

Magnific:

### Windows

```powershell
node src\cli.js estimate `
  --provider magnific `
  --model bytedance-seedance-mini-2.0 `
  --prompt "Luxury perfume bottle, slow dolly in" `
  --duration 5 `
  --aspect-ratio 9:16 `
  --resolution 720p
```

### macOS

```bash
node src/cli.js estimate \
  --provider magnific \
  --model bytedance-seedance-mini-2.0 \
  --prompt "Luxury perfume bottle, slow dolly in" \
  --duration 5 \
  --aspect-ratio 9:16 \
  --resolution 720p
```

비용은 매번 live 결과를 확인하세요. 문서의 예시 숫자를 승인값으로 사용하면
안 됩니다.

---

## 12. 영상 생성

아래 명령부터 실제 provider 크레딧이 사용될 수 있습니다.

### Windows — 단일 텍스트 영상

```powershell
node src\cli.js generate `
  --provider magnific `
  --model bytedance-seedance-mini-2.0 `
  --prompt "Luxury perfume bottle on black marble, slow dolly in" `
  --duration 5 `
  --aspect-ratio 9:16 `
  --resolution 720p `
  --approved-cost "방금 확인하고 승인한 비용" `
  --output output\perfume-shot-01.mp4 `
  --yes
```

### macOS — 단일 텍스트 영상

```bash
mkdir -p output

node src/cli.js generate \
  --provider magnific \
  --model bytedance-seedance-mini-2.0 \
  --prompt "Luxury perfume bottle on black marble, slow dolly in" \
  --duration 5 \
  --aspect-ratio 9:16 \
  --resolution 720p \
  --approved-cost "방금 확인하고 승인한 비용" \
  --output output/perfume-shot-01.mp4 \
  --yes
```

### BBANANA Seedance 멀티 이미지 예제

상대 경로와 `/`를 사용하면 Windows와 macOS에서 같은 JSON을 재사용하기 쉽습니다.

Windows:

```powershell
node src\cli.js generate `
  --provider bbanana `
  --model "Seedance 2.0" `
  --operation image_to_video `
  --reference-images '["refs/character.png","refs/background.png"]' `
  --prompt "Two racers drift through a blue tunnel, stable 2D animation" `
  --duration 10 `
  --aspect-ratio 16:9 `
  --resolution 720p `
  --provider-options '{"tier":"mini","options":{"quality":"720p"}}' `
  --approved-cost "Seedance Mini 720p 10초의 확인된 비용" `
  --output output\seedance-sample.mp4 `
  --yes
```

macOS:

```bash
node src/cli.js generate \
  --provider bbanana \
  --model "Seedance 2.0" \
  --operation image_to_video \
  --reference-images '["refs/character.png","refs/background.png"]' \
  --prompt "Two racers drift through a blue tunnel, stable 2D animation" \
  --duration 10 \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --provider-options '{"tier":"mini","options":{"quality":"720p"}}' \
  --approved-cost "Seedance Mini 720p 10초의 확인된 비용" \
  --output output/seedance-sample.mp4 \
  --yes
```

안전장치:

- `--yes`가 없으면 유료 작업을 제출하지 않습니다.
- 비용 승인이 필요한 provider는 `--approved-cost`가 없으면 제출하지 않습니다.
- 실패나 timeout 후 자동 재제출하지 않습니다.
- provider를 자동으로 바꾸지 않습니다.

---

## 13. OpenMontage 장면계획 실행

### Windows

```powershell
node src\cli.js compile `
  --scene-plan "$WorkRoot\OpenMontage\projects\my-film\artifacts\scene_plan.json" `
  --provider bbanana `
  --model "Seedance 2.0" `
  --aspect-ratio 16:9 `
  --resolution 720p `
  --jobs output\jobs.json

node src\cli.js run-plan `
  --jobs output\jobs.json `
  --output-dir "$WorkRoot\OpenMontage\projects\my-film\assets\video" `
  --manifest "$WorkRoot\OpenMontage\projects\my-film\artifacts\asset_manifest.json" `
  --project-root "$WorkRoot\OpenMontage\projects\my-film" `
  --approved-cost "사용자가 승인한 비용 조건" `
  --yes
```

### macOS

```bash
node src/cli.js compile \
  --scene-plan "$WORK_ROOT/OpenMontage/projects/my-film/artifacts/scene_plan.json" \
  --provider bbanana \
  --model "Seedance 2.0" \
  --aspect-ratio 16:9 \
  --resolution 720p \
  --jobs output/jobs.json

node src/cli.js run-plan \
  --jobs output/jobs.json \
  --output-dir "$WORK_ROOT/OpenMontage/projects/my-film/assets/video" \
  --manifest "$WORK_ROOT/OpenMontage/projects/my-film/artifacts/asset_manifest.json" \
  --project-root "$WORK_ROOT/OpenMontage/projects/my-film" \
  --approved-cost "사용자가 승인한 비용 조건" \
  --yes
```

`compile`은 생성하거나 과금하지 않습니다. 여러 작업의 비용이 서로 다르면
`jobs.json`의 각 job에 개별 `approvedCost`를 넣는 방식을 권장합니다.

---

## 14. Codex에 요청하는 예시

```text
OpenMontage로 30초짜리 16:9 영상을 만들어줘.

조건:
- 먼저 AGENT_GUIDE.md와 PROJECT_CONTEXT.md를 읽어.
- provider는 bbanana_mcp_video로 고정해.
- 실제 MCP에서 모델, tier, duration, resolution, 비용을 조회해.
- 생성 전에 설정과 예상 크레딧을 보여주고 승인을 받아.
- 처음에는 한 장면만 샘플로 생성해.
- 실패하면 자동 재시도하거나 다른 provider로 바꾸지 마.
- 승인된 결과를 asset_manifest에 기록해.
```

비용 승인 예시:

```text
샘플 생성 승인.
provider: bbanana
model: Seedance 2.0
tier: mini
duration: 10초
resolution: 720p
aspect ratio: 16:9
approved cost: 방금 조회한 10초 샘플 비용

이 조건으로 한 번만 생성해. 실패하면 멈추고 작업 ID와 오류를 알려줘.
```

---

## 15. 문제 해결

### Windows: `npm.ps1` 실행 정책 오류

```powershell
npm.cmd install
npx.cmd --version
```

PowerShell에서는 `npm`/`npx` 대신 `npm.cmd`/`npx.cmd`를 사용하세요.

### Windows: `spawn EINVAL`

`.cmd` 실행 래핑 문제일 수 있습니다. 인증 명령을 다음처럼 실행합니다.

```powershell
cmd.exe /d /s /c npx.cmd -p mcp-remote@latest mcp-remote-client https://kling.ai/mcp
```

### macOS: `command not found: python`

가상환경을 활성화하지 않았거나 Python이 `python3`로만 설치된 상태입니다.

```bash
cd "$WORK_ROOT/OpenMontage"
source .venv/bin/activate
python --version
```

가상환경을 만들기 전에는 `python3`를 사용하세요.

### macOS: Apple Silicon에서 명령 경로를 찾지 못함

Homebrew 기본 경로를 현재 셸에 등록합니다.

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Intel Mac의 Homebrew 기본 경로는 일반적으로 `/usr/local`입니다.

### OAuth가 계속 대기함

1. 브라우저 로그인과 권한 승인이 완료됐는지 확인합니다.
2. 터미널의 성공 메시지를 확인합니다.
3. 완료 후 `Ctrl+C`로 보조 클라이언트를 종료합니다.
4. `doctor`를 다시 실행합니다.

디버그 로그:

Windows:

```powershell
$env:OM_MCP_DEBUG = "1"
node src\cli.js doctor --provider higgsfield
```

macOS:

```bash
export OM_MCP_DEBUG=1
node src/cli.js doctor --provider higgsfield
```

### `BBANANA_MCP_TOKEN`이 필요하다는 오류

현재 명령을 실행하는 같은 터미널 세션에 환경변수가 있어야 합니다.

Windows:

```powershell
Test-Path Env:BBANANA_MCP_TOKEN
```

macOS:

```bash
test -n "$BBANANA_MCP_TOKEN" && echo "token is set"
```

토큰 값 자체를 `echo`로 출력하지 마세요.

### `doctor`는 성공하지만 생성 도구가 보이지 않음

다음 순서로 다시 확인합니다.

```bash
node src/cli.js doctor --provider bbanana
node src/cli.js tools --provider bbanana
node src/cli.js catalog --provider bbanana
node src/cli.js call --provider bbanana --tool check_credits --args '{}'
```

환경변수를 새로 저장했다면 새 Terminal 또는 새 Codex 작업을 여세요.

### OpenMontage에서 MCP 도구가 unavailable

1. 브리지 저장소에서 `doctor`가 성공했는지 확인합니다.
2. `.state/<provider>.json` readiness 영수증을 확인합니다.
3. `install-openmontage --dry-run`을 다시 실행합니다.
4. 저장소가 서로 다른 상위 폴더에 있다면
   `OPENMONTAGE_MCP_BRIDGE_CLI`를 설정합니다.

---

## 16. 설치 및 보안 체크리스트

### 공통

- [ ] Git, Python, Node.js 20+, FFmpeg 설치
- [ ] OpenMontage 가상환경과 의존성 설치
- [ ] 브리지 `npm install` 완료
- [ ] `node src/cli.js providers`에서 provider 4개 확인
- [ ] `install-openmontage --dry-run` 확인 후 shim 설치

### 인증

- [ ] 사용할 provider의 `doctor` 성공
- [ ] `tools` 또는 `catalog`에서 실제 도구·모델 확인
- [ ] BBANANA는 `check_credits`까지 확인
- [ ] 토큰 값이 Git 추적 파일에 없는지 확인
- [ ] OAuth 캐시와 `.mcp-auth`를 공유하지 않음

### 첫 생성 전

- [ ] provider 하나를 명시적으로 선택
- [ ] 정확한 모델 ID/service name 확인
- [ ] tier·duration·resolution·aspect ratio 확인
- [ ] live 비용 확인
- [ ] 한 장면 샘플 비용 승인
- [ ] 자동 재시도와 자동 provider 전환이 꺼져 있는지 확인

---

## 17. 개발자 검증

실제 유료 요청 없이 로컬 테스트를 실행합니다.

Windows:

```powershell
npm.cmd test
npm.cmd run check
Get-ChildItem integrations\openmontage\*.py |
  ForEach-Object { python -m py_compile $_.FullName }
```

macOS:

```bash
npm test
npm run check
python3 -m py_compile integrations/openmontage/*.py
```

---

## 18. 공식 링크

- [OpenMontage GitHub](https://github.com/calesthio/OpenMontage)
- [OpenMontage MCP Providers GitHub](https://github.com/ddokkang2/openmontage-mcp-providers)
- [Kling MCP](https://kling.ai/mcp)
- [Magnific MCP 문서](https://docs.magnific.com/modelcontextprotocol)
- [Higgsfield MCP](https://higgsfield.ai/mcp)

---

## 한 줄 요약

```text
OS별 설치 → shim 설치 → MCP 인증 → doctor/tools/catalog 검증
→ 모델·비용 확인 → 사용자 승인 → 샘플 생성 → asset_manifest → 최종 편집
```
