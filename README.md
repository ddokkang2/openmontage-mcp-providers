# OpenMontage MCP Providers

OpenMontage의 기획 산출물을 MCP 생성 도구로 보내고, 결과를 다시
OpenMontage `asset_manifest`로 돌려주는 독립형 브리지입니다.

첫 provider는 [Kling 공식 MCP](https://kling.ai/mcp)입니다. API 키를
별도로 코드에 넣지 않고 `mcp-remote` OAuth 세션을 사용합니다.

> Community project. OpenMontage 또는 Kling의 공식 배포물이 아닙니다.

## 왜 별도 저장소인가

- OpenMontage 본체 업데이트와 provider 업데이트를 분리합니다.
- OpenMontage 코드를 복사하지 않고 JSON artifact와 작은 shim으로 연결합니다.
- `call` 명령은 다른 MCP 서버에도 그대로 재사용할 수 있습니다.
- 생성 provider별 차이는 `providers/*.json`과 얇은 adapter에 격리합니다.

## 현재 범위

- 범용 MCP: provider 목록, 도구 조회, 임의 tool call, 연결 진단
- Kling: 공식 MCP OAuth 연결, text-to-video 제출/조회/다운로드
- OpenMontage: `scene_plan` → job plan → `asset_manifest`
- OpenMontage native provider shim: `video_selector` 자동 발견 지원
- 안전장치: 유료 생성은 `--yes` 없이는 제출하지 않음

현재 `generate`의 고수준 자동화는 Kling text-to-video에 맞춰져 있습니다.
다른 MCP는 즉시 `tools`/`call`로 사용할 수 있고, 자동 생성 흐름은 해당
서버의 profile adapter를 추가해야 합니다.

## 요구 사항

- Node.js 20 이상
- Windows에서는 `npx.cmd`
- Kling 계정과 완료된 MCP OAuth
- OpenMontage 연동 시 로컬 OpenMontage checkout

## 설치

```powershell
git clone https://github.com/ddokkang2/openmontage-mcp-providers.git
cd openmontage-mcp-providers
npm install
```

Kling OAuth를 아직 마치지 않았다면:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://kling.ai/mcp
```

토큰이나 `.mcp-auth` 내용은 저장소에 커밋하지 마세요.

## 연결 확인

```powershell
node src\cli.js doctor --provider kling
```

`doctor`는 과금 작업을 만들지 않습니다. `who_am_i` 결과에 표시된 정확한
모델명을 다음 명령에서 사용하세요. 모델명은 코드가 추측하지 않습니다.
성공 시 `.state/kling.json`에 비밀정보가 없는 readiness 영수증을 남기며,
OpenMontage shim은 이 파일로 마지막 연결 진단 성공 여부를 확인합니다.

## OpenMontage scene plan 컴파일

```powershell
node src\cli.js compile `
  --scene-plan examples\scene_plan.json `
  --model kling-video-v3_0_omni `
  --aspect-ratio 9:16 `
  --jobs output\jobs.json
```

이 단계도 과금되지 않습니다.

## 단일 영상 생성

아래 명령부터는 Kling credits를 사용합니다.

```powershell
node src\cli.js generate `
  --provider kling `
  --model kling-video-v3_0_omni `
  --prompt "Luxury perfume bottle on black marble, slow dolly in" `
  --duration 5 `
  --aspect-ratio 9:16 `
  --resolution 1080p `
  --output output\perfume.mp4 `
  --yes
```

실패나 timeout이 발생해도 자동 재제출하지 않습니다.

## scene plan 전체 실행

```powershell
node src\cli.js run-plan `
  --jobs output\jobs.json `
  --output-dir C:\path\to\OpenMontage\projects\my-film\assets\video `
  --manifest C:\path\to\OpenMontage\projects\my-film\artifacts\asset_manifest.json `
  --project-root C:\path\to\OpenMontage\projects\my-film `
  --yes
```

각 scene의 `required_assets` 중 `source=generate`이고 `type=video` 또는
`animation`인 항목만 작업으로 컴파일합니다.

## OpenMontage native provider 설치

먼저 변경 내용을 확인합니다.

```powershell
node src\cli.js install-openmontage `
  --path C:\path\to\OpenMontage `
  --dry-run
```

확인 후 설치:

```powershell
node src\cli.js install-openmontage `
  --path C:\path\to\OpenMontage `
  --yes
```

필요하면 브리지 CLI 경로를 환경변수로 지정합니다.

```powershell
$env:OPENMONTAGE_MCP_BRIDGE_CLI = "C:\path\to\openmontage-mcp-providers\src\cli.js"
```

설치 후 OpenMontage registry가 `kling_mcp_video`를 발견하며
`video_selector`에서 `preferred_provider: "kling_mcp"`로 선택할 수 있습니다.
OpenMontage의 pipeline, preflight, approval checkpoint 규칙은 그대로
지켜야 합니다.

## 다른 MCP 추가

`examples/custom-provider.json`처럼 transport를 정의하면 범용 호출을 바로
쓸 수 있습니다.

```powershell
node src\cli.js tools --provider my-provider --config examples\custom-provider.json
node src\cli.js call `
  --provider my-provider `
  --config examples\custom-provider.json `
  --tool some_tool `
  --args '@args.json'
```

OpenMontage 자동 생성까지 연결하려면 provider의 생성, 조회, 결과 URL
규칙을 profile adapter로 추가해야 합니다. MCP라고 해서 모든 서버의
작업 의미가 동일한 것은 아니기 때문입니다.

## 테스트

```powershell
npm test
npm run check
```

테스트는 로컬 mock MCP를 사용하며 유료 생성 요청을 보내지 않습니다.

## 라이선스

브리지 자체는 MIT입니다. OpenMontage checkout에 shim을 설치해 함께
배포하는 경우 OpenMontage의 AGPL-3.0 의무도 별도로 확인하세요.
