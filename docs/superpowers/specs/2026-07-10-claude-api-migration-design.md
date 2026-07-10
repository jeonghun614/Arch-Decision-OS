# Gemini → Claude API 마이그레이션 (백엔드 프록시) — Design Spec

- 날짜: 2026-07-10
- 상태: 승인됨 (사용자 확인)
- 브랜치: `claude/architecture-design-os-dev-4meg98`

## 1. 배경과 문제

현재 앱은 `@google/genai`로 Gemini(`gemini-2.5-flash`)를 브라우저에서 직접
호출한다. 사용자는 이를 Claude API로 교체하기를 원한다. 마이그레이션과 함께
해결해야 할 기존 구조 문제:

- **API 키가 브라우저 번들에 주입됨** — `vite.config.ts`의 `define`이
  `GEMINI_API_KEY`를 클라이언트 코드에 박아 넣는다. Claude 키(유료 결제 연동)를
  같은 방식으로 쓰면 배포 시 누구나 devtools로 키를 탈취할 수 있다.
- **AI Studio 전용 연동** — `window.aistudio` 키 선택 UI는 AI Studio 밖에서는
  동작하지 않는 죽은 경로다.

## 2. 확정된 결정 (사용자 선택)

| 결정 | 선택 |
|---|---|
| 키 보호 | 백엔드 프록시 (프론트는 키를 절대 다루지 않음) |
| 백엔드 형태 | 경량 Express 서버 (`server/`, 범용 배포 가능) |
| 기본 모델 | `claude-sonnet-5` (속도/비용 균형) |
| API 경계 | 의미 단위 엔드포인트 5개 (프롬프트·스키마는 서버 소유) |
| 구조화 출력 | 원시 JSON Schema + `output_config.format` (Zod 미도입) |
| AI Studio 키 UI | 제거 (`hasApiKey`/`handleOpenSelectKey`/`window.aistudio` 선언 포함) |

## 3. 목표 / 비목표

### 목표
1. Gemini 호출 5곳(구조화 4 + 텍스트 1)을 Claude로 교체한다.
2. API 키를 서버 환경변수로만 존재하게 한다 (클라이언트 번들에서 완전 제거).
3. AI 서비스 함수 4종의 시그니처를 유지해 호출부 변경을 최소화한다.
   호출부에 허용되는 수정은 (a) import 경로 갱신(파일 개명), (b)
   `runEP1ProgramTree` 호출에서 apiKey 인자 제거, (c) §2에서 결정된
   aistudio 키 UI 관련 상태 삭제 — 이 세 가지뿐이다.
4. 프롬프트 내용(한국어 지시문)과 응답 데이터 형태는 그대로 유지한다.

### 비목표
- 프롬프트 품질 개선/재작성 — 하지 않는다 (별도 사이클).
- 스트리밍 응답 — 하지 않는다 (현재도 비스트리밍).
- 인증/사용자 관리, 요청 제한(rate limiting) — 하지 않는다.
- localhost:5050 diffusion 서버(평면도 생성) — 이번 범위 밖, 무변경.
- logicEngine·시각화·상태 구조 — 무변경.

## 4. 아키텍처

```
개발:  브라우저 ── /api/* ──▶ Vite dev 프록시 ──▶ Express (localhost:8787) ──▶ Claude API
배포:  브라우저 ── /api/* ──▶ Express (dist/ 정적 서빙 + /api) ──▶ Claude API
```

- Express가 프로덕션에서 `dist/`를 정적 서빙(+SPA 폴백)하므로 배포는 단일
  프로세스다.
- 서버는 TypeScript로 작성하고 `tsx`로 실행한다 — 루트 `types.ts`와
  `data/ep1/*.json`을 그대로 import해 타입·규칙 데이터 중복을 없앤다.
- 환경변수는 Node 22 내장 `process.loadEnvFile('.env.local')`로 로드한다
  (파일이 없으면 무시하고 `process.env`만 사용 — 배포 환경 호환). dotenv 불필요.

## 5. 서버 구성 (`server/` 신규)

| 파일 | 책임 |
|---|---|
| `server/index.ts` | Express 앱: 엔드포인트 5개, dist 정적 서빙, 에러 매핑, 포트 8787 |
| `server/claude.ts` | Anthropic 클라이언트 단일 인스턴스 + 모델 상수 (`claude-sonnet-5`) |
| `server/prompts.ts` | 시스템 프롬프트 5종 + JSON Schema 4종 (기존 파일에서 이동, 문구 무변경) |

### 엔드포인트 (모두 POST, JSON in/out)

| 경로 | 입력 | 출력 | 스키마 |
|---|---|---|---|
| `/api/kernel-narrative` | `{ checkpoint, previousDecisions, historyText, projectContext, allowed, blocked }` | `{ logic_summary, critic_ready_statement, do_not_do, next_action, ai_recommendation }` | RESPONSE_SCHEMA |
| `/api/final-report` | `{ richHistory, projectContext }` | `FinalReport` | FINAL_REPORT_SCHEMA |
| `/api/visual-guide` | `{ diagramType, selectionDetails, projectContext }` | `VisualGuide` | VISUAL_GUIDE_SCHEMA |
| `/api/image-prompt` | `{ projectContext, logicDetails, guideHints }` | `{ prompt: string }` | 없음 (텍스트) |
| `/api/ep1-program-tree` | `{ blueprint: BlueprintJSON }` | `EP1ProgramTree` | EP1_RESPONSE_SCHEMA |

**역할 분담 원칙**: `calculateAvailableOptions`(logicEngine)는 지금처럼
프론트에서 실행한다 — UI가 allowed/blocked를 직접 소비하기 때문이다. 서버는
그 결과를 받아 서사만 생성한다. 옵션 상세(축 데이터) 조회(`getOptionDetails`)와
richHistory/selectionDetails 문자열 구성도 지금처럼 프론트(서비스 함수)에서
수행해 서버에 전달한다 — 서버가 `DC_LIBRARY`를 중복 소유하지 않게 한다.
EP1 규칙 JSON 9종의 import는 서버로 이동한다(프론트 번들에서 제거).

## 6. Claude 호출 규약

- SDK: `@anthropic-ai/sdk`, `client.messages.create(...)` (비스트리밍).
- 모델: `claude-sonnet-5` — `server/claude.ts`의 상수 한 곳에서만 정의.
- `max_tokens: 16000` (비스트리밍 권장 상한).
- 구조화 출력: `output_config: { format: { type: "json_schema", schema } }`.
  응답은 `stop_reason` 확인 후 text 블록을 `JSON.parse`.
- effort: 서사성 호출 4종(`kernel-narrative`, `final-report`, `visual-guide`,
  `image-prompt`)은 `output_config.effort: "low"`, EP1은 effort 미지정(기본 high).
- thinking 파라미터는 보내지 않는다 (Sonnet 5는 생략 시 adaptive).
- `temperature`/`top_p`/`top_k`는 보내지 않는다 (Sonnet 5에서 400).

### 스키마 변환 규칙 (Gemini `Type.*` → JSON Schema)

기계적 매핑: `Type.OBJECT`→`"object"`, `Type.ARRAY`→`"array"`,
`Type.STRING`→`"string"`, `Type.NUMBER`→`"number"`, `Type.INTEGER`→`"integer"`.
추가로 Claude 구조화 출력 요구사항을 적용한다:
- 모든 object 노드에 `additionalProperties: false`
- 모든 object 노드에 `required` 배열 명시 (기존 Gemini 스키마에서 required가
  생략된 노드는 전체 프로퍼티를 required로 지정 — 현 응답 소비 코드가 모든
  필드를 사용하므로 안전)

**유일한 비기계적 변환**: EP1의 `domain_vector: { type: OBJECT }`(자유 형식
객체)는 Claude 구조화 출력이 표현할 수 없다(`additionalProperties: false`가
강제라 free-form 불가). 스키마에서는 `domain_vector_json: string`(JSON 인코딩
문자열)으로 받고, 서버가 `JSON.parse`하여 기존 `EP1ProgramTree.domain_vector`
필드로 복원한다. 파싱 실패 시 `{}`로 대체한다(서사적 참고 데이터라 치명적이지
않음). 프론트 타입은 무변경.

## 7. 프론트 변경

- `services/geminiService.ts` → **`services/aiService.ts`로 개명**. 함수 4개
  (`runKernel`, `generateFinalReport`, `generateVisualGuide`,
  `generateImagePrompt`) 시그니처 동일 유지, 내부만 `fetch('/api/...')`로 교체.
  `getOptionDetails`와 richHistory/selectionDetails 구성 로직은 이 파일에 남는다.
  import하는 쪽(`useProjectState.ts`)의 import 경로만 갱신.
- `services/ep1Service.ts`: `runEP1ProgramTree(blueprint: BlueprintJSON):
  Promise<EP1ProgramTree>` — apiKey 파라미터 제거, `fetch('/api/ep1-program-tree')`
  호출로 교체. EP1 규칙 import와 프롬프트/스키마는 서버로 이동.
- `src/hooks/useProjectState.ts`: `hasApiKey` 상태, `checkApiKey` effect,
  `handleOpenSelectKey`, `generateReport` 내 apiKey 조회 블록 삭제.
  `runEP1ProgramTree(grammarResult)` 한 줄로 수정. 반환 객체에서
  `hasApiKey`/`handleOpenSelectKey` 제거.
- `src/components/StartScreen.tsx`: `hasApiKey`/`handleOpenSelectKey` 구조분해와
  "SELECT API KEY" 안내 블록(108-122행) 삭제.
- `src/types.d.ts`: `window.aistudio` 선언만 있는 파일 — 삭제.
- 에러 문구: 프론트의 한국어 폴백 메시지 구조는 유지하되, Gemini 전용 안내
  (aistudio 키 발급 등)를 Claude 기준(429=사용량 한도, 401=서버 키 미설정,
  fetch 실패=서버 미기동 안내)으로 교체.

## 8. 설정·의존성

- `package.json`
  - dependencies: `@google/genai` 제거 / `@anthropic-ai/sdk`, `express` 추가
  - devDependencies: `tsx`, `concurrently`, `@types/express` 추가
  - scripts: `"dev": "concurrently \"vite\" \"tsx watch server/index.ts\""`,
    `"start": "npm run build && tsx server/index.ts"` (기존 build/preview/test/lint 유지)
- `vite.config.ts`: `define` 블록(키 주입) 삭제,
  `server.proxy: { '/api': 'http://localhost:8787' }` 추가.
- `index.html`: importmap에서 `@google/genai` 항목 제거.
- `.env.local` (gitignored): `ANTHROPIC_API_KEY=...` — 서버 전용.
- `README.md`: 실행 방법 갱신 (`ANTHROPIC_API_KEY` 설정 + `npm run dev`).

## 9. 에러 처리

- 서버: Anthropic SDK 타입 예외를 구체 순서로 catch —
  `AuthenticationError`(401) / `RateLimitError`(429) / `APIStatusError`(그 외
  상태) / `APIConnectionError`(네트워크) — HTTP 상태를 보존해
  `{ error: { status, message } }` JSON으로 응답. `ANTHROPIC_API_KEY` 미설정
  시 부팅은 허용하되 모든 `/api` 요청에 500 + 명시적 메시지.
- 프론트: 서비스 함수의 기존 try/catch-폴백 구조 유지. `fetch` 실패(서버
  미기동)와 서버 에러 응답을 구분해 한국어 안내 문구 매핑. 실패 시에도 UI가
  계속 동작하는 현 동작(allowed/blocked는 로컬 계산이므로 결정 플로우 유지)
  보존.

## 10. 테스트·검증

- 기존 19개 vitest 무변경 통과.
- 신규 `server/schemas.test.ts`: 4개 JSON Schema를 재귀 순회하며 (a) 모든
  object 노드에 `additionalProperties: false` 존재, (b) `required`가
  `properties` 키의 부분집합, (c) EP1 스키마에 `domain_vector_json` 문자열
  필드 존재를 검증.
- `npm run lint`(tsc)가 서버 코드 포함 통과.
- E2E: dev로 양쪽 기동 → 브라우저에서 결정 플로우 완주. 이 환경(실 키 없음)
  에서는 서버가 Claude 호출 실패를 반환하고 프론트 폴백이 렌더되는 것까지
  확인. 실 응답 품질 확인은 사용자가 로컬에서 실 키로 수행.

## 11. 구현 파일 목록

| 파일 | 작업 |
|---|---|
| `server/index.ts` | 신규 |
| `server/claude.ts` | 신규 |
| `server/prompts.ts` | 신규 (프롬프트/스키마 이동 + 변환) |
| `server/schemas.test.ts` | 신규 |
| `services/geminiService.ts` | 삭제 → `services/aiService.ts` 신규 (fetch 기반, 시그니처 유지) |
| `services/ep1Service.ts` | 수정 (fetch 기반, apiKey 파라미터 제거) |
| `src/hooks/useProjectState.ts` | 수정 (aistudio/hasApiKey 제거, import 경로) |
| `src/components/StartScreen.tsx` | 수정 (키 UI 제거) |
| `src/types.d.ts` | 삭제 |
| `vite.config.ts` | 수정 (define 삭제, proxy 추가) |
| `index.html` | 수정 (importmap 정리) |
| `package.json` | 수정 (의존성/스크립트) |
| `README.md` | 수정 (실행 안내) |
