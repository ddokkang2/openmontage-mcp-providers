# OpenMontage MCP Providers

OpenMontage의 기획 결과를 외부 생성 MCP로 보내고, 완성된 미디어를 다시
OpenMontage `asset_manifest`로 돌려주는 독립형 브리지입니다.

> 한국어로 처음부터 설치하고 사용하는 방법은
> [OpenMontage + MCP Provider 설치·사용 매뉴얼](docs/OPENMONTAGE_MCP_MANUAL_KO.md)을
> 참고하세요.

지원 provider:

| Provider | 인증 | 주요 용도 | 현재 어댑터 |
|---|---|---|---|
| Kling | OAuth | 공식 Kling 영상 생성 | 전용 |
| Magnific | OAuth | 영상·이미지 생성, 업스케일, 후처리 | 전용 영상 스키마 + 범용 호출 |
| Higgsfield | OAuth | 영상·이미지·캐릭터·광고 제작 | 도구 스키마 자동 매핑 |
| BBANANA | Bearer 환경변수 | 여러 영상·이미지 모델의 명시적 선택 | 전용 |

이 프로젝트는 각 서비스의 비공식 재구현이 아닙니다. 공식 MCP endpoint에
연결하는 커뮤니티 어댑터이며 OpenMontage나 각 서비스가 배포하는 공식 패키지가
아닙니다.

## 동작 원리

```text
OpenMontage scene_plan
        |
        v
provider가 명시된 generation jobs
        |
        v
모델/옵션/예상 크레딧 조회
        |
        v
사용자의 명시적 비용 승인
        |
        v
선택한 MCP만 호출 -> 상태 조회 -> 결과 다운로드
        |
        v
OpenMontage asset_manifest
```

provider를 자동으로 바꾸지 않습니다. 실패나 timeout 때 자동 재제출도 하지
않습니다. 유료 생성에는 `--yes`가 필요하고, 비용 조회를 지원하는 provider에는
`--approved-cost`도 필요합니다.

## 설치

Node.js 20 이상이 필요합니다.

```powershell
git clone https://github.com/ddokkang2/openmontage-mcp-providers.git
cd openmontage-mcp-providers
npm install
node src\cli.js providers
```

### OAuth provider

Kling:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://kling.ai/mcp
node src\cli.js doctor --provider kling
```

Magnific:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://mcp.magnific.com
node src\cli.js doctor --provider magnific
```

Higgsfield:

```powershell
npx.cmd -p mcp-remote@latest mcp-remote-client https://mcp.higgsfield.ai/mcp
node src\cli.js doctor --provider higgsfield
```

OAuth 토큰이나 `.mcp-auth` 내용을 저장소에 커밋하지 마세요.

### BBANANA

토큰 값을 provider JSON에 넣지 않고 환경변수 이름만 보관합니다.

```powershell
$env:BBANANA_MCP_TOKEN = "YOUR_TOKEN"
node src\cli.js doctor --provider bbanana
```

`doctor`는 연결, 인증, 도구 목록과 읽기 전용 모델 카탈로그만 확인하고
`.state/<provider>.json` readiness 영수증을 만듭니다. 생성은 제출하지 않습니다.

공식 연결 안내:

- [Higgsfield MCP](https://higgsfield.ai/mcp)
- [Higgsfield CLI](https://github.com/higgsfield-ai/cli)
- [Magnific MCP 문서](https://docs.magnific.com/modelcontextprotocol)
- [Kling MCP](https://kling.ai/mcp)

## 읽기 전용 탐색과 비용 확인

```powershell
node src\cli.js tools --provider magnific
node src\cli.js catalog --provider magnific

node src\cli.js catalog --provider bbanana
```

Magnific은 `simulate_cost`를 호출해 실제 요청 형태의 예상 크레딧을 확인합니다.

```powershell
node src\cli.js estimate `
  --provider magnific `
  --model bytedance-seedance-mini-2.0 `
  --prompt "Luxury perfume bottle, slow dolly in" `
  --duration 5 `
  --aspect-ratio 9:16 `
  --resolution 720p
```

BBANANA의 `catalog` 결과에는 model, tier, duration, resolution별 `credit_map`
또는 `credit_cost`가 포함됩니다. 선택지를 사용자에게 보여준 다음 정확히 승인된
비용 문자열을 생성 명령에 전달해야 합니다.

## 단일 영상 생성

아래 명령부터 실제 크레딧이 사용될 수 있습니다.

```powershell
node src\cli.js generate `
  --provider magnific `
  --model bytedance-seedance-mini-2.0 `
  --prompt "Luxury perfume bottle, slow dolly in" `
  --duration 5 `
  --aspect-ratio 9:16 `
  --resolution 720p `
  --approved-cost "사용자가 확인한 비용" `
  --output output\perfume.mp4 `
  --yes
```

provider 고유 옵션은 JSON으로 추가할 수 있습니다.

```powershell
--provider-options '{"video":{"clips":[{"cameraMotion":"pushIn"}]}}'
```

BBANANA는 `options`, `image_urls`, `video_urls`, `audio_url` 등 실제 MCP
스키마의 필드를 전달할 수 있습니다.

## OpenMontage scene plan

```powershell
node src\cli.js compile `
  --scene-plan examples\scene_plan.json `
  --provider bbanana `
  --model "Seedance 2.0 Mini" `
  --aspect-ratio 9:16 `
  --resolution 720p `
  --jobs output\jobs.json
```

`compile`은 과금하지 않습니다. 생성 전에 `output\jobs.json`의 각 job에
`approvedCost`를 기록하거나 `run-plan --approved-cost`를 명시해야 합니다.

```powershell
node src\cli.js run-plan `
  --jobs output\jobs.json `
  --output-dir C:\path\to\OpenMontage\projects\my-film\assets\video `
  --manifest C:\path\to\OpenMontage\projects\my-film\artifacts\asset_manifest.json `
  --project-root C:\path\to\OpenMontage\projects\my-film `
  --approved-cost "사용자가 확인한 비용" `
  --yes
```

## OpenMontage native tool shim 설치

먼저 변경 대상을 확인합니다.

```powershell
node src\cli.js install-openmontage `
  --path C:\path\to\OpenMontage `
  --providers all `
  --dry-run
```

확인 후 설치합니다.

```powershell
node src\cli.js install-openmontage `
  --path C:\path\to\OpenMontage `
  --providers all `
  --yes
```

설치되는 도구:

- `kling_mcp_video`
- `magnific_mcp_video`
- `higgsfield_mcp_video`
- `bbanana_mcp_video`

저장소가 OpenMontage와 같은 상위 폴더에 없으면 브리지 경로를 지정하세요.

```powershell
$env:OPENMONTAGE_MCP_BRIDGE_CLI = "C:\path\to\openmontage-mcp-providers\src\cli.js"
```

OpenMontage의 기존 preflight, 승인 checkpoint, assets checkpoint는 그대로
유지해야 합니다.

## 임의 MCP 호출

모든 기능에 고수준 어댑터가 필요한 것은 아닙니다. 등록된 도구는 범용 명령으로
즉시 호출할 수 있습니다.

```powershell
node src\cli.js call `
  --provider magnific `
  --tool images_models_list `
  --args '{}'
```

커스텀 서버는 `examples/custom-provider.json` 형식으로 추가할 수 있습니다.
stdio와 Streamable HTTP transport를 지원합니다.

## 테스트

```powershell
npm test
npm run check
python -m py_compile integrations\openmontage\*.py
```

테스트는 로컬 mock MCP를 사용하며 유료 생성 요청을 보내지 않습니다.

## 라이선스

브리지 자체는 MIT입니다. 수정한 OpenMontage를 재배포한다면 OpenMontage의
AGPL-3.0 의무를 별도로 확인하세요.
