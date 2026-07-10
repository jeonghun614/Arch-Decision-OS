# Gemini → Claude API 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저에서 직접 호출하던 Gemini(`@google/genai`)를, API 키를 서버에만 보관하는 경량 Express 프록시 + Claude API(`claude-sonnet-5`, JSON Schema 구조화 출력)로 교체한다.

**Architecture:** `server/`(Express + `@anthropic-ai/sdk`)가 의미 단위 엔드포인트 5개로 기존 프롬프트·스키마를 소유하고, 프론트 서비스 함수들은 시그니처를 유지한 채 내부만 `fetch('/api/...')`로 바뀐다. 개발은 Vite 프록시(`/api` → :8787), 프로덕션은 Express가 `dist/`까지 정적 서빙한다. logicEngine·시각화·상태 구조는 무변경.

**Tech Stack:** React 19 + Vite 6 (기존), Express + `@anthropic-ai/sdk` + `tsx` + `concurrently` (신규), vitest (기존).

**Spec:** `docs/superpowers/specs/2026-07-10-claude-api-migration-design.md`

## Global Constraints

- 모델은 `claude-sonnet-5` — `server/claude.ts`의 `MODEL` 상수 한 곳에서만 정의. 다른 파일에 모델 문자열 금지.
- Claude 요청에 `temperature`/`top_p`/`top_k`/`thinking` 파라미터를 절대 보내지 않는다 (Sonnet 5에서 400 또는 불필요).
- `max_tokens: 16000` (비스트리밍). 서사성 4종 엔드포인트만 `output_config.effort: "low"`, EP1은 effort 미지정.
- 모든 JSON Schema의 object 노드에 `additionalProperties: false` + `required` 명시.
- API 키는 서버 환경변수(`ANTHROPIC_API_KEY`)로만 존재. 클라이언트 번들에 어떤 키도 주입 금지.
- 프론트 AI 서비스 함수 4종의 시그니처 유지: `runKernel(checkpoint, selections, decisionHistory, projectContext?)`, `generateFinalReport(decisionHistory, projectContext?)`, `generateVisualGuide(checkpoint, selection, projectContext)`, `generateImagePrompt(checkpoint, selection, projectContext, visualGuideData?)`.
- 시스템 프롬프트(한국어 지시문) 문구는 **한 글자도 바꾸지 않고** 기존 파일에서 이동한다.
- 모든 커밋 직전 `npm run lint && npm test` 통과. 기존 19개 테스트 무변경 유지.
- git 커밋 정체성: 저장소 로컬 config `user.name Claude` / `user.email noreply@anthropic.com` (이미 설정됨). 커밋 메시지 트레일러 2줄:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV
  ```
- 작업 브랜치: `claude/architecture-design-os-dev-4meg98` (push는 `git push -u origin claude/architecture-design-os-dev-4meg98`).
- `.env.local`은 gitignored — 절대 커밋하지 않는다. 이 파일에는 기존 `GEMINI_API_KEY=dummy...` 줄이 있을 수 있음(vitest 기동용) — 지우지 말 것.

## 도메인 배경 (구현자용 60초 요약)

건축 설계 학생용 의사결정 앱. 결정 단계(DC1~DC7)마다 로컬 순수 함수
`calculateAvailableOptions`(services/logicEngine.ts)가 허용/차단 옵션을 계산하고,
AI는 그 결과에 **서사**(요약·추천·크리틱 멘트)만 입힌다. 완주 후 최종 리포트,
선택별 비주얼 가이드, 이미지 프롬프트, EP1 프로그램 트리(공간 목록 JSON)를 AI가
생성한다. 현재 이 5가지 호출이 전부 브라우저에서 `@google/genai`
`responseSchema`(구조화 출력)로 이루어진다 — 이것을 서버 경유 Claude 호출로
바꾸는 것이 이번 작업이다. 실 API 키는 이 개발 환경에 없다: 키 부재 시 서버가
에러 JSON을 반환하고 프론트 폴백이 렌더되는 것까지가 여기서 검증 가능한 범위다.

---

### Task 1: 의존성 + `server/prompts.ts` (프롬프트 이동 + JSON Schema 변환) + 스키마 테스트

**Files:**
- Modify: `package.json` (의존성/스크립트)
- Create: `server/prompts.ts`
- Test: `server/schemas.test.ts`

**Interfaces:**
- Consumes: `services/geminiService.ts`와 `services/ep1Service.ts`의 기존 프롬프트 문자열(verbatim 이동), `data/ep1/*.json` 9종
- Produces (Task 2가 사용):
  - `KERNEL_SYSTEM`, `FINAL_REPORT_SYSTEM`, `VISUAL_GUIDE_SYSTEM`, `EP1_SYSTEM: string` — 시스템 프롬프트 (EP1은 규칙 컨텍스트 포함 완성본)
  - `KERNEL_SCHEMA`, `FINAL_REPORT_SCHEMA`, `VISUAL_GUIDE_SCHEMA`, `EP1_SCHEMA: object` — Claude 구조화 출력용 JSON Schema

- [ ] **Step 1: 의존성 설치 및 스크립트 등록**

```bash
cd /home/user/Arch-Decision-OS
npm install @anthropic-ai/sdk express
npm install -D tsx concurrently @types/express
```

`package.json`의 `scripts`를 다음으로 갱신 (`build`/`preview`/`test`/`lint`는 그대로):

```json
  "scripts": {
    "dev": "concurrently -k \"vite\" \"tsx watch server/index.ts\"",
    "build": "vite build",
    "preview": "vite preview",
    "start": "npm run build && tsx server/index.ts",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
```

(`server/index.ts`는 Task 2에서 생성된다 — `npm run dev`는 Task 2 전까지 서버 쪽이 즉시 종료하지만 이 태스크에서는 실행하지 않으므로 무방.)

- [ ] **Step 2: 실패하는 스키마 테스트 작성**

`server/schemas.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import {
  KERNEL_SCHEMA,
  FINAL_REPORT_SCHEMA,
  VISUAL_GUIDE_SCHEMA,
  EP1_SCHEMA,
} from './prompts';

// Claude 구조화 출력 요구사항을 재귀 검증한다:
// 모든 object 노드에 additionalProperties:false, required ⊆ properties 키.
function checkNode(node: any, path: string, problems: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    if (node.additionalProperties !== false) {
      problems.push(`${path}: additionalProperties !== false`);
    }
    if (!Array.isArray(node.required)) {
      problems.push(`${path}: required 배열 없음`);
    } else {
      const keys = Object.keys(node.properties ?? {});
      for (const r of node.required) {
        if (!keys.includes(r)) problems.push(`${path}: required '${r}'가 properties에 없음`);
      }
    }
    for (const [k, v] of Object.entries(node.properties ?? {})) {
      checkNode(v, `${path}.${k}`, problems);
    }
  }
  if (node.type === 'array') checkNode(node.items, `${path}[]`, problems);
}

const ALL = {
  KERNEL_SCHEMA,
  FINAL_REPORT_SCHEMA,
  VISUAL_GUIDE_SCHEMA,
  EP1_SCHEMA,
} as const;

describe('Claude 구조화 출력 스키마', () => {
  for (const [name, schema] of Object.entries(ALL)) {
    it(`${name}: 모든 object 노드가 요구사항을 만족한다`, () => {
      const problems: string[] = [];
      checkNode(schema, name, problems);
      expect(problems).toEqual([]);
    });
  }

  it('EP1_SCHEMA: domain_vector는 JSON 문자열 필드로 대체되었다', () => {
    const props = (EP1_SCHEMA as any).properties;
    expect(props.domain_vector).toBeUndefined();
    expect(props.domain_vector_json).toEqual(
      expect.objectContaining({ type: 'string' })
    );
    expect((EP1_SCHEMA as any).required).toContain('domain_vector_json');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run server/schemas.test.ts`
Expected: FAIL — `Cannot find module './prompts'`

- [ ] **Step 4: `server/prompts.ts` 작성**

시스템 프롬프트 4종은 **기존 파일에서 문자열을 그대로 옮긴다** (한 글자도 수정 금지):

| export 이름 | 원본 위치 (verbatim 복사) |
|---|---|
| `KERNEL_SYSTEM` | `services/geminiService.ts`의 `GENERATION_SYSTEM_INSTRUCTION` 백틱 문자열 전체 |
| `FINAL_REPORT_SYSTEM` | 같은 파일 `FINAL_REPORT_INSTRUCTION` 전체 |
| `VISUAL_GUIDE_SYSTEM` | 같은 파일 `VISUAL_GUIDE_INSTRUCTION` 전체 |
| (EP1 기반) | `services/ep1Service.ts`의 `EP1_SYSTEM_INSTRUCTION` 전체 |

파일 구조 (프롬프트 문자열 자리는 위 표대로 원본에서 복사):

```ts
// EP1 규칙 JSON — services/ep1Service.ts 상단의 9개 import를 그대로 가져온다
// (경로만 ../data/... 로 동일, tsx가 JSON import를 처리한다)
import domainVectorRules from "../data/ep1/domain-vector.rules.json";
import patternLibrary from "../data/ep1/pattern-library.json";
import patternLibraryPatch from "../data/ep1/pattern-library-patch.json";
import patternCompositionRules from "../data/ep1/pattern-composition.rules.json";
import clusterRules from "../data/ep1/cluster.rules.json";
import programDataModel from "../data/ep1/program-data-model.json";
import areaScalingRules from "../data/ep1/area-scaling.rules.json";
import spaceMinAreaRules from "../data/ep1/space-min-area.rules.json";
import relationAutoGenRules from "../data/ep1/relation-auto-generation.rules.json";

export const KERNEL_SYSTEM = `...(GENERATION_SYSTEM_INSTRUCTION verbatim)...`;
export const FINAL_REPORT_SYSTEM = `...(FINAL_REPORT_INSTRUCTION verbatim)...`;
export const VISUAL_GUIDE_SYSTEM = `...(VISUAL_GUIDE_INSTRUCTION verbatim)...`;

const EP1_SYSTEM_INSTRUCTION = `...(ep1Service의 EP1_SYSTEM_INSTRUCTION verbatim)...`;

// ep1Service.ts의 ep1Context 템플릿(=== EP1 RULES: ... === 블록 9개)을 그대로 이동
const ep1Context = `
=== EP1 RULES: DOMAIN VECTOR ===
${JSON.stringify(domainVectorRules, null, 2)}

=== EP1 RULES: PATTERN LIBRARY ===
${JSON.stringify(patternLibrary, null, 2)}

=== EP1 RULES: PATTERN LIBRARY PATCH ===
${JSON.stringify(patternLibraryPatch, null, 2)}

=== EP1 RULES: PATTERN COMPOSITION ENGINE ===
${JSON.stringify(patternCompositionRules, null, 2)}

=== EP1 RULES: CLUSTER RULES ===
${JSON.stringify(clusterRules, null, 2)}

=== EP1 RULES: PROGRAM DATA MODEL (SPACE SCHEMA) ===
${JSON.stringify(programDataModel, null, 2)}

=== EP1 RULES: AREA SCALING ===
${JSON.stringify(areaScalingRules, null, 2)}

=== EP1 RULES: SPACE MIN AREA ===
${JSON.stringify(spaceMinAreaRules, null, 2)}

=== EP1 RULES: RELATION AUTO-GENERATION ===
${JSON.stringify(relationAutoGenRules, null, 2)}
`;

export const EP1_SYSTEM = EP1_SYSTEM_INSTRUCTION + "\n\n" + ep1Context;
```

스키마 4종은 아래 코드를 그대로 사용한다 (Gemini `Type.*` 스키마의 기계적 변환 + `additionalProperties:false`/`required` 보강):

```ts
export const KERNEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    logic_summary: { type: "string" },
    critic_ready_statement: { type: "array", items: { type: "string" } },
    do_not_do: { type: "array", items: { type: "string" } },
    next_action: { type: "string" },
    ai_recommendation: {
      type: "object",
      additionalProperties: false,
      properties: {
        best_option_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["best_option_id", "reason"],
    },
  },
  required: ["logic_summary", "critic_ready_statement", "do_not_do", "next_action", "ai_recommendation"],
} as const;

export const FINAL_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    core_logic: { type: "string" },
    causality: { type: "string" },
    user_scenario: { type: "string" },
    excluded_tradeoffs: { type: "string" },
  },
  required: ["core_logic", "causality", "user_scenario", "excluded_tradeoffs"],
} as const;

export const VISUAL_GUIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    core_message: { type: "string" },
    logic_structure: { type: "array", items: { type: "string" } },
    design_strategies: { type: "array", items: { type: "string" } },
    prohibitions: { type: "array", items: { type: "string" } },
    presentation_speech: { type: "string" },
  },
  required: ["title", "core_message", "logic_structure", "design_strategies", "prohibitions", "presentation_speech"],
} as const;

export const EP1_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    spaces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          space_type: { type: "string" },
          category_label: { type: "string" },
          cluster_id: { type: "string" },
          quantity: { type: "integer" },
          area: {
            type: "object",
            additionalProperties: false,
            properties: {
              each_mm2: { type: "number" },
              total_mm2: { type: "number" },
              net_or_gross: { type: "string" },
            },
            required: ["each_mm2", "total_mm2", "net_or_gross"],
          },
          placement: {
            type: "object",
            additionalProperties: false,
            properties: {
              floor_preference: {
                type: "object",
                additionalProperties: false,
                properties: {
                  preferred: { type: "array", items: { type: "integer" } },
                  avoid: { type: "array", items: { type: "integer" } },
                  min_floor: { type: "integer" },
                  max_floor: { type: "integer" },
                },
                required: ["preferred", "avoid", "min_floor", "max_floor"],
              },
              span: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string" },
                  from_floor: { type: "integer" },
                  to_floor: { type: "integer" },
                },
                required: ["type", "from_floor", "to_floor"],
              },
            },
            required: ["floor_preference", "span"],
          },
        },
        required: ["id", "name", "space_type", "category_label", "cluster_id", "quantity", "area", "placement"],
      },
    },
    clusters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          category_label: { type: "string" },
          weight: { type: "number" },
          space_kits: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "category_label", "weight", "space_kits"],
      },
    },
    relations: {
      type: "object",
      additionalProperties: false,
      properties: {
        graph: {
          type: "object",
          additionalProperties: false,
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  space_id: { type: "string" },
                  category_label: { type: "string" },
                },
                required: ["space_id", "category_label"],
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  relation_type: { type: "string" },
                  score: { type: "number" },
                  reason: { type: "string" },
                },
                required: ["from", "to", "relation_type", "score"],
              },
            },
          },
          required: ["nodes", "edges"],
        },
      },
      required: ["graph"],
    },
    selected_patterns: { type: "array", items: { type: "string" } },
    // Gemini의 자유형식 domain_vector: {type: OBJECT}는 Claude 구조화 출력이
    // 표현할 수 없다(additionalProperties:false 강제). JSON 문자열로 받아
    // 서버(Task 2)에서 파싱해 domain_vector로 복원한다. (스펙 §6)
    domain_vector_json: {
      type: "string",
      description: "domain_vector 객체를 JSON으로 인코딩한 문자열",
    },
  },
  required: ["spaces", "clusters", "relations", "selected_patterns", "domain_vector_json"],
} as const;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run server/schemas.test.ts`
Expected: PASS — 5 tests passed

- [ ] **Step 6: 전체 검증 후 커밋**

```bash
npm run lint && npm test
git add package.json package-lock.json server/prompts.ts server/schemas.test.ts
git commit -m "feat: add server prompts module with Claude structured-output schemas

Moves the five system prompts verbatim out of the browser services and
converts the four Gemini Type.* response schemas to JSON Schema with
additionalProperties:false and explicit required arrays. Free-form
domain_vector becomes a JSON-encoded string field per the design spec.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

Expected: lint 통과, 24 tests passed (기존 19 + 신규 5). 이 시점에는 기존
`services/geminiService.ts`/`ep1Service.ts`가 아직 그대로 있다(프롬프트가 잠시
두 곳에 존재) — Task 3·4에서 원본이 삭제된다.

---

### Task 2: Express 서버 (`server/claude.ts` + `server/index.ts`) + Vite 프록시

**Files:**
- Create: `server/claude.ts`
- Create: `server/index.ts`
- Modify: `vite.config.ts` (proxy 추가 — define 삭제는 Task 5)

**Interfaces:**
- Consumes: Task 1의 `KERNEL_SYSTEM`/`FINAL_REPORT_SYSTEM`/`VISUAL_GUIDE_SYSTEM`/`EP1_SYSTEM`, `KERNEL_SCHEMA`/`FINAL_REPORT_SCHEMA`/`VISUAL_GUIDE_SCHEMA`/`EP1_SCHEMA`
- Produces (Task 3·4가 사용): HTTP API —
  - `POST /api/kernel-narrative` body `{ checkpoint, previousDecisions, historyText, projectContext, allowed, blocked }` → 200 `{ logic_summary, critic_ready_statement, do_not_do, next_action, ai_recommendation }`
  - `POST /api/final-report` body `{ richHistory, projectContext }` → 200 `FinalReport`
  - `POST /api/visual-guide` body `{ diagramType, selectionDetails, projectContext }` → 200 `VisualGuide`
  - `POST /api/image-prompt` body `{ projectContext, logicDetails, guideHints }` → 200 `{ prompt: string }`
  - `POST /api/ep1-program-tree` body `{ blueprint }` → 200 `EP1ProgramTree`
  - 실패 시 4xx/5xx `{ error: { status: number, message: string } }`

- [ ] **Step 1: `server/claude.ts` 작성**

```ts
import Anthropic from "@anthropic-ai/sdk";

// 서버 전용 환경변수 로드 (.env.local, gitignored). 파일이 없으면 무시 —
// 배포 환경에서는 프로세스 환경변수를 그대로 쓴다.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local — process.env만 사용
}

export const MODEL = "claude-sonnet-5";

let cached: Anthropic | null = null;

// 키가 없어도 서버 부팅은 되게 하고, 요청 시점에 명확한 에러를 낸다 (스펙 §9)
export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local 파일에 키를 추가하세요."
    );
  }
  cached ??= new Anthropic(); // ANTHROPIC_API_KEY를 env에서 자동 인식
  return cached;
}

interface StructuredArgs {
  system: string;
  user: string;
  schema: object;
  effort?: "low";
}

function extractText(res: Anthropic.Message): string {
  if (res.stop_reason === "refusal") {
    throw new Error("모델이 이 요청의 처리를 거부했습니다.");
  }
  if (res.stop_reason === "max_tokens") {
    throw new Error("응답이 최대 토큰 한도에서 잘렸습니다. 다시 시도해주세요.");
  }
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text" || !block.text.trim()) {
    throw new Error("모델이 빈 응답을 반환했습니다.");
  }
  return block.text;
}

export async function structuredCall<T>(args: StructuredArgs): Promise<T> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    output_config: {
      format: { type: "json_schema", schema: args.schema },
      ...(args.effort ? { effort: args.effort } : {}),
    },
  });
  return JSON.parse(extractText(res)) as T;
}

export async function textCall(args: { user: string; effort?: "low" }): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: args.user }],
    ...(args.effort ? { output_config: { effort: args.effort } } : {}),
  });
  return extractText(res).trim();
}
```

주의: `output_config`가 설치된 SDK 버전에서 타입 미지원이면 `@anthropic-ai/sdk`를
최신으로 올린다 (`npm install @anthropic-ai/sdk@latest`). 우회 캐스팅으로 넘어가지
말 것 — 파라미터 자체는 GA다.

- [ ] **Step 2: `server/index.ts` 작성**

```ts
import express from "express";
import path from "node:path";
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import {
  structuredCall,
  textCall,
} from "./claude";
import {
  KERNEL_SYSTEM,
  FINAL_REPORT_SYSTEM,
  VISUAL_GUIDE_SYSTEM,
  EP1_SYSTEM,
  KERNEL_SCHEMA,
  FINAL_REPORT_SCHEMA,
  VISUAL_GUIDE_SCHEMA,
  EP1_SCHEMA,
} from "./prompts";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Anthropic SDK 타입 예외 → HTTP 응답 매핑. 구체 클래스 먼저, 연결 오류는
// APIError의 하위 클래스이므로 APIError보다 먼저 검사한다.
function errorBody(e: unknown): { status: number; message: string } {
  if (e instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "서버의 ANTHROPIC_API_KEY가 유효하지 않습니다." };
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Claude API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해주세요." };
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "Claude API에 연결할 수 없습니다. 네트워크를 확인해주세요." };
  }
  if (e instanceof Anthropic.APIError) {
    return { status: typeof e.status === "number" ? e.status : 500, message: e.message };
  }
  return { status: 500, message: e instanceof Error ? e.message : "알 수 없는 서버 오류" };
}

type Handler = (body: any) => Promise<unknown>;

function route(pathname: string, handler: Handler): void {
  app.post(pathname, async (req, res) => {
    try {
      res.json(await handler(req.body ?? {}));
    } catch (e) {
      const { status, message } = errorBody(e);
      console.error(`[${pathname}]`, message);
      res.status(status).json({ error: { status, message } });
    }
  });
}

route("/api/kernel-narrative", async (body) => {
  const user = `
    LOGIC ENGINE OUTPUT:
    ${JSON.stringify(
      {
        project_context: body.projectContext ?? { name: "Unknown", description: "No description provided." },
        current_stage: body.checkpoint,
        previous_decisions: body.previousDecisions,
        calculated_available_options: body.allowed,
        calculated_blocked_options: body.blocked,
      },
      null,
      2
    )}

    HISTORY:
    ${body.historyText}

    TASK:
    Generate the narrative fields including the AI recommendation based on the project context and available options.
  `;
  return structuredCall({ system: KERNEL_SYSTEM, user, schema: KERNEL_SCHEMA, effort: "low" });
});

route("/api/final-report", async (body) => {
  const user = `
    PROJECT CONTEXT:
    Name: ${body.projectContext?.name ?? "Unknown"}
    Description: ${body.projectContext?.description ?? "No description"}

    FULL DECISION HISTORY WITH LOGIC ATTRIBUTES:
    ${body.richHistory}

    TASK:
    Synthesize the final architectural logic report.
    Use the provided 'Attributes' to explain the *mechanics* of the decision chain (why X led to Y).
  `;
  return structuredCall({ system: FINAL_REPORT_SYSTEM, user, schema: FINAL_REPORT_SCHEMA, effort: "low" });
});

route("/api/visual-guide", async (body) => {
  const user = `
    PROJECT CONTEXT:
    Name: ${body.projectContext?.name}
    Description: ${body.projectContext?.description}

    TARGET DIAGRAM TYPE: ${body.diagramType}
    SELECTED DECISION: ${body.selectionDetails}

    TASK:
    Provide deep architectural logic analysis and strategic guidelines for this decision.
  `;
  return structuredCall({ system: VISUAL_GUIDE_SYSTEM, user, schema: VISUAL_GUIDE_SCHEMA, effort: "low" });
});

route("/api/image-prompt", async (body) => {
  // services/geminiService.ts generateImagePrompt의 contents 템플릿을 그대로 옮긴다
  // (You are an expert prompt engineer ... Return ONLY the prompt string ...).
  // logicDetails/guideHints는 프론트가 조립해 보낸 문자열이다.
  const user = `
    You are an expert prompt engineer for advanced architectural AI image generators (like Midjourney, Nano Banana, or Stable Diffusion).

    PROJECT: ${body.projectContext?.name}
    DESCRIPTION: ${body.projectContext?.description}
    ARCHITECTURAL LOGIC: ${body.logicDetails}
    ${body.guideHints ?? ""}

    TASK:
    Write a single, highly detailed, professional text-to-image prompt (English) to visualize this specific architectural logic.

    The prompt MUST include:
    1. **Subject**: Abstract architectural diagram or conceptual massing model.
    2. **Composition**: Isometric view, axonometric projection, or exploded view as appropriate.
    3. **Style**: Minimalist, clean lines, "white aesthetic", "diagrammatic", "unreal engine 5 render", "highly detailed".
    4. **Lighting/Color**: Soft studio lighting, white background, single accent color (e.g., "emerald green" or "signal orange") to highlight the logical relationships (connections, buffers, voids).
    5. **Specifics**: Translate the logic attributes (e.g., "Clustered Mass", "Linear", "Porous") into visual descriptors (e.g., "fragmented cubes", "continuous linear volume", "perforated facade").

    OUTPUT FORMAT:
    Return ONLY the prompt string. Do not add any conversational text or markdown.
  `;
  return { prompt: await textCall({ user, effort: "low" }) };
});

route("/api/ep1-program-tree", async (body) => {
  const bp = body.blueprint;
  const user = `
=== INPUT: BLUEPRINT JSON (DC1~DC7 결과) ===
${JSON.stringify(bp, null, 2)}

위 BlueprintJSON과 EP1 규칙을 사용하여 구체적인 Program Tree를 생성하라.
총 GFA: ${bp?.computed?.gross_floor_area_mm2}mm²
층수: ${bp?.inputs?.floors}층
사이트 면적: ${bp?.computed?.site_area_mm2}mm²
`;
  const raw = await structuredCall<any>({ system: EP1_SYSTEM, user, schema: EP1_SCHEMA });
  // domain_vector_json(문자열) → domain_vector(객체) 복원. 파싱 실패는 {}로
  // 대체한다 — 서사적 참고 데이터라 치명적이지 않다 (스펙 §6).
  const { domain_vector_json, ...rest } = raw;
  let domain_vector: Record<string, unknown> = {};
  try {
    domain_vector = JSON.parse(domain_vector_json);
  } catch {
    console.error("[/api/ep1-program-tree] domain_vector_json 파싱 실패 — {} 사용");
  }
  return { ...rest, domain_vector };
});

// 프로덕션: dist/ 정적 서빙 + SPA 폴백 (express 5의 와일드카드 경로 문법을
// 피하기 위해 미들웨어로 처리)
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(dist, "index.html"));
    } else {
      next();
    }
  });
}

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[server] ANTHROPIC_API_KEY 미설정 — /api 요청은 500을 반환합니다");
  }
});
```

- [ ] **Step 3: `vite.config.ts`에 프록시 추가**

`server:` 블록을 다음으로 교체 (define 블록은 이 태스크에서 건드리지 않는다):

```ts
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': 'http://localhost:8787',
        },
      },
```

- [ ] **Step 4: 부팅·에러 매핑 검증 (키 없는 환경 기준)**

```bash
cd /home/user/Arch-Decision-OS
npm run lint
npx tsx server/index.ts &
sleep 2
# 키 미설정 (.env.local의 GEMINI_API_KEY만 있음) → 500 + 명시적 메시지
curl -s -X POST localhost:8787/api/final-report -H 'content-type: application/json' \
  -d '{"richHistory":"[DC1] test","projectContext":{"name":"t","description":"d"}}'
kill %1
```

Expected: lint 통과. curl 출력이 `{"error":{"status":500,"message":"서버에 ANTHROPIC_API_KEY가 설정되지..."}}` 형태.
(만약 `.env.local`에 `ANTHROPIC_API_KEY`가 더미로라도 있으면 401 AuthenticationError 매핑이 나온다 — 어느 쪽이든 `{error:{status,message}}` 형태면 통과.)

- [ ] **Step 5: 전체 테스트 후 커밋**

```bash
npm test
git add server/claude.ts server/index.ts vite.config.ts
git commit -m "feat: add Express proxy serving Claude API endpoints

Five semantic endpoints own the prompts and structured-output calls on
claude-sonnet-5; the API key lives only in the server process. Boots
without a key and returns a mapped {error:{status,message}} JSON on
every failure class. Vite dev proxy forwards /api to :8787, and the
server statically serves dist/ in production.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 3: 프론트 `services/aiService.ts` (geminiService 대체)

**Files:**
- Create: `services/aiService.ts`
- Delete: `services/geminiService.ts`
- Modify: `src/hooks/useProjectState.ts:4` (import 경로만)

**Interfaces:**
- Consumes: Task 2의 HTTP API (`/api/kernel-narrative`, `/api/final-report`, `/api/visual-guide`, `/api/image-prompt`)
- Produces (기존과 동일 — 호출부 무변경):
  - `runKernel(checkpoint: Checkpoint, selections: SelectionState, decisionHistory: DecisionLog[], projectContext?: {name,description}): Promise<EngineOutput>`
  - `generateFinalReport(decisionHistory: DecisionLog[], projectContext?): Promise<FinalReport>`
  - `generateVisualGuide(checkpoint, selection: {id,label}, projectContext): Promise<VisualGuide>`
  - `generateImagePrompt(checkpoint, selection, projectContext, visualGuideData?): Promise<string>`

- [ ] **Step 1: `services/aiService.ts` 작성**

기존 `services/geminiService.ts`에서 다음을 **그대로 유지**한다: `DIAGRAM_TYPES`
맵, `getOptionDetails` 함수, 각 함수의 히스토리/상세 문자열 조립 로직과 에러 시
폴백 반환 구조. 바뀌는 것은 Gemini 호출 → `post()` 헬퍼뿐이다.

```ts
import { Checkpoint, DecisionLog, EngineOutput, SelectionState, FinalReport, VisualGuide } from "../types";
import { calculateAvailableOptions } from "./logicEngine";
import { DC_LIBRARY } from "../data/staticData";

const DIAGRAM_TYPES: Record<Checkpoint, string> = {
  [Checkpoint.DC1]: "Problem Field (문제 분포)",
  [Checkpoint.DC2]: "Spatial Attitude (공간 태도)",
  [Checkpoint.DC5]: "Circulation Sequence (동선 구조)",
  [Checkpoint.DC3]: "Program Operation (운영 방식)",
  [Checkpoint.DC4]: "Massing Strategy (매스 전략)",
  [Checkpoint.DC6]: "Structural Logic (구조 논리)",
  [Checkpoint.DC7]: "Expression Logic (표현 논리)"
};

// ── getOptionDetails: geminiService.ts의 동명 함수를 그대로 이동 (무변경) ──
function getOptionDetails(checkpoint: Checkpoint, id: string): any {
  let list: any[] = [];
  switch (checkpoint) {
    case Checkpoint.DC1: list = DC_LIBRARY.dc1_options; break;
    case Checkpoint.DC2: list = DC_LIBRARY.dc2_types; break;
    case Checkpoint.DC5: list = DC_LIBRARY.dc5_types; break;
    case Checkpoint.DC3: list = DC_LIBRARY.dc3_options; break;
    case Checkpoint.DC4: list = DC_LIBRARY.dc4_options; break;
    case Checkpoint.DC6: list = DC_LIBRARY.dc6_options; break;
    case Checkpoint.DC7: list = DC_LIBRARY.dc7_options; break;
  }
  const match = list.find(o => (o.id === id || o.type === id));
  if (!match) return null;
  const attributes: any = {};
  if (match.engine_axes) attributes.axes = match.engine_axes;
  if (match.bias_axis_pref) attributes.preference = match.bias_axis_pref;
  if (match.anti_axis_forbid) attributes.forbid = match.anti_axis_forbid;
  return { label: match.label, attributes };
}

// ── 서버 프록시 호출 헬퍼 ──
async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("AI 서버에 연결할 수 없습니다. `npm run dev`로 서버가 함께 실행 중인지 확인해주세요.");
  }
  if (!res.ok) {
    let message = `AI 서버 오류 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
    } catch { /* JSON이 아니면 상태 코드 메시지 유지 */ }
    throw new Error(message);
  }
  return await res.json() as T;
}

export async function runKernel(
  checkpoint: Checkpoint,
  selections: SelectionState,
  decisionHistory: DecisionLog[],
  projectContext?: { name: string; description: string }
): Promise<EngineOutput> {
  const { allowed, blocked } = calculateAvailableOptions(checkpoint, selections);

  const historyText = decisionHistory.map(l => {
    const val = Array.isArray(l.selectedLabel) ? l.selectedLabel.join(" + ") : l.selectedLabel;
    return `[${l.checkpoint}] ${val}`;
  }).join("\n");

  try {
    const narrative = await post<{
      logic_summary: string;
      critic_ready_statement: string[];
      do_not_do: string[];
      next_action: string;
      ai_recommendation: { best_option_id: string; reason: string };
    }>("/api/kernel-narrative", {
      checkpoint,
      projectContext: projectContext ?? { name: "Unknown", description: "No description provided." },
      previousDecisions: {
        DC1: selections.dc1_id,
        DC2: selections.dc2_type,
        DC5: selections.dc5_types.join(" + "),
        DC3: selections.dc3_ids.join(", "),
        DC4: selections.dc4_ids.join(", "),
        DC6: selections.dc6_ids.join(", "),
        DC7: selections.dc7_ids.join(", ")
      },
      historyText,
      allowed: allowed.map(o => `${o.id}: ${o.label} (${o.status})`).join("\n"),
      blocked: blocked.map(o => `${o.id}: ${o.label} [BLOCKED by ${o.blocked_by.join(',')}]`).join("\n"),
    });

    return {
      current_stage: checkpoint,
      available_options: allowed,
      blocked_options: blocked,
      logic_summary: narrative.logic_summary,
      critic_ready_statement: narrative.critic_ready_statement,
      do_not_do: narrative.do_not_do,
      next_action: narrative.next_action,
      ai_recommendation: narrative.ai_recommendation,
    };
  } catch (error) {
    console.error("Kernel Error:", error);
    return {
      current_stage: checkpoint,
      available_options: allowed,
      blocked_options: blocked,
      logic_summary: error instanceof Error ? error.message : "AI 응답 생성 중 오류가 발생했습니다.",
      critic_ready_statement: [],
      do_not_do: [],
      next_action: "다음 선택을 진행하십시오."
    };
  }
}

export async function generateFinalReport(
  decisionHistory: DecisionLog[],
  projectContext?: { name: string; description: string }
): Promise<FinalReport> {
  const richHistory = decisionHistory.map(l => {
    const ids = Array.isArray(l.selectedId) ? l.selectedId : [l.selectedId];
    const details = ids.map(id => {
      const info = getOptionDetails(l.checkpoint, id);
      return info ? `${info.label} (Attributes: ${JSON.stringify(info.attributes)})` : id;
    }).join(" + ");
    return `[${l.checkpoint}] SELECTED: ${details}`;
  }).join("\n\n");

  try {
    return await post<FinalReport>("/api/final-report", { richHistory, projectContext });
  } catch (error) {
    console.error("Final Report Generation Error:", error);
    return {
      core_logic: error instanceof Error ? error.message : "결과 생성 중 오류가 발생했습니다.",
      causality: "",
      user_scenario: "",
      excluded_tradeoffs: ""
    };
  }
}

export async function generateVisualGuide(
  checkpoint: Checkpoint,
  selection: { id: string | string[], label: string | string[] },
  projectContext: { name: string, description: string }
): Promise<VisualGuide> {
  const ids = Array.isArray(selection.id) ? selection.id : [selection.id];
  const labels = Array.isArray(selection.label) ? selection.label : [selection.label];
  const selectionDetails = ids.map((id, idx) => {
    const info = getOptionDetails(checkpoint, id);
    return info ? `${info.label} (Logic Attributes: ${JSON.stringify(info.attributes)})` : labels[idx];
  }).join(" + ");

  try {
    return await post<VisualGuide>("/api/visual-guide", {
      diagramType: DIAGRAM_TYPES[checkpoint],
      selectionDetails,
      projectContext,
    });
  } catch (error) {
    console.error("Visual Guide Generation Error:", error);
    return {
      title: "Error Generating Guide",
      core_message: error instanceof Error ? error.message : "가이드를 생성하는 중 오류가 발생했습니다.",
      logic_structure: ["다시 시도해주세요."],
      design_strategies: [],
      prohibitions: [],
      presentation_speech: "오류가 발생했습니다."
    };
  }
}

export async function generateImagePrompt(
  checkpoint: Checkpoint,
  selection: { id: string | string[], label: string | string[] },
  projectContext: { name: string, description: string },
  visualGuideData?: VisualGuide
): Promise<string> {
  const ids = Array.isArray(selection.id) ? selection.id : [selection.id];
  const labels = Array.isArray(selection.label) ? selection.label : [selection.label];
  const logicDetails = ids.map((id, idx) => {
    const info = getOptionDetails(checkpoint, id);
    const axisInfo = info?.attributes?.axes ? JSON.stringify(info.attributes.axes) : "";
    return `Selected Concept: ${info?.label || labels[idx]}. Logic Attributes: ${axisInfo}`;
  }).join(" + ");

  const guideHints = visualGuideData
    ? `
      Architectural Strategies to Visualize:
      - Logic Structure: ${visualGuideData.logic_structure.join("; ")}
      - Key Strategies: ${visualGuideData.design_strategies.join("; ")}
      - Avoid: ${visualGuideData.prohibitions.join("; ")}
      `
    : "";

  try {
    const data = await post<{ prompt: string }>("/api/image-prompt", {
      projectContext,
      logicDetails,
      guideHints,
    });
    return data.prompt;
  } catch (error) {
    console.error("Prompt Generation Error:", error);
    return "프롬프트 생성 중 오류가 발생했습니다. 다시 시도해주세요.";
  }
}
```

- [ ] **Step 2: geminiService 삭제 및 import 갱신**

```bash
git rm services/geminiService.ts
```

`src/hooks/useProjectState.ts` 4행:

```ts
// 변경 전
import { runKernel, generateFinalReport, generateVisualGuide as generateVisualGuideApi, generateImagePrompt } from '@/services/geminiService';
// 변경 후
import { runKernel, generateFinalReport, generateVisualGuide as generateVisualGuideApi, generateImagePrompt } from '@/services/aiService';
```

- [ ] **Step 3: 검증 후 커밋**

Run: `npm run lint && npm test`
Expected: 둘 다 PASS (24 tests). lint에서 geminiService 참조 잔재가 있으면 실패로 드러난다.

```bash
git add services/aiService.ts src/hooks/useProjectState.ts
git commit -m "feat: replace browser Gemini calls with server proxy client

services/aiService.ts keeps the four public signatures and the local
option-detail assembly, but delegates all model calls to the Express
proxy. Korean fallback messages now surface the server-mapped error.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 4: `services/ep1Service.ts` 전환 + 호출부 정리

**Files:**
- Modify: `services/ep1Service.ts` (전체 교체)
- Modify: `src/hooks/useProjectState.ts` (apiKey 조회 블록 삭제 + 호출 한 줄)

**Interfaces:**
- Consumes: Task 2의 `POST /api/ep1-program-tree`
- Produces: `runEP1ProgramTree(blueprint: BlueprintJSON): Promise<EP1ProgramTree>` — **apiKey 파라미터 제거** (스펙 목표 3의 허용 예외)

- [ ] **Step 1: `services/ep1Service.ts` 전체를 다음으로 교체**

(기존 EP1 프롬프트·스키마·규칙 import는 Task 1에서 서버로 이동 완료 — 이 파일에서 삭제된다)

```ts
import { BlueprintJSON, EP1ProgramTree } from "../types";

export async function runEP1ProgramTree(blueprint: BlueprintJSON): Promise<EP1ProgramTree> {
  let res: Response;
  try {
    res = await fetch("/api/ep1-program-tree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint }),
    });
  } catch {
    throw new Error("AI 서버에 연결할 수 없습니다. `npm run dev`로 서버가 함께 실행 중인지 확인해주세요.");
  }
  if (!res.ok) {
    let message = `EP1 프로그램 트리 생성 실패 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
    } catch { /* 상태 코드 메시지 유지 */ }
    throw new Error(message);
  }
  return await res.json() as EP1ProgramTree;
}
```

- [ ] **Step 2: `useProjectState.ts`의 apiKey 블록 제거**

`generateReport` 안의 다음 블록(약 134-140행)을:

```ts
      let apiKey = '';
      if (window.aistudio) {
        apiKey = await (window.aistudio as any).getApiKey?.() ?? '';
      }
      if (!apiKey) apiKey = process.env.GEMINI_API_KEY ?? process.env.API_KEY ?? '';

      const programTree = await runEP1ProgramTree(grammarResult, apiKey);
```

다음 한 줄로 교체:

```ts
      const programTree = await runEP1ProgramTree(grammarResult);
```

- [ ] **Step 3: 검증 후 커밋**

Run: `npm run lint && npm test`
Expected: PASS (24 tests)

```bash
git add services/ep1Service.ts src/hooks/useProjectState.ts
git commit -m "feat: route EP1 program tree generation through the server proxy

runEP1ProgramTree drops its apiKey parameter; the EP1 prompt, rules
context, and schema now live server-side only.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 5: Gemini 잔재 제거 (aistudio UI · 키 주입 · 의존성 · README)

**Files:**
- Modify: `src/hooks/useProjectState.ts` (hasApiKey/checkApiKey/handleOpenSelectKey 삭제)
- Modify: `src/components/StartScreen.tsx` (키 선택 UI 삭제)
- Delete: `src/types.d.ts`
- Modify: `vite.config.ts` (define 블록·loadEnv 삭제)
- Modify: `index.html` (importmap에서 @google/genai 제거)
- Modify: `package.json` (`@google/genai` 제거)
- Modify: `README.md`

- [ ] **Step 1: `useProjectState.ts`에서 aistudio 경로 삭제**

다음을 모두 제거한다:
1. `const [hasApiKey, setHasApiKey] = useState(false);` (15행)
2. `checkApiKey` useEffect 블록 전체 (62-72행: `const checkApiKey = async () => {...}; checkApiKey();`를 담은 useEffect)
3. `handleOpenSelectKey` 함수 전체 (74-79행)
4. 반환 객체의 `hasApiKey,`와 `handleOpenSelectKey,` 두 줄

- [ ] **Step 2: `StartScreen.tsx`에서 키 선택 UI 삭제**

1. 9행 구조분해에서 `hasApiKey, handleOpenSelectKey,` 제거:

```ts
  const { state, setState, handleStart } = ctx;
```

2. `{!hasApiKey && (` 로 시작하는 안내 블록 전체(108-122행, "SELECT API KEY" 버튼 포함) 삭제.

- [ ] **Step 3: `src/types.d.ts` 삭제**

```bash
git rm src/types.d.ts
```

(이 파일은 `window.aistudio` 전역 선언만 담고 있다 — Step 1·2 이후 참조가 없다.)

- [ ] **Step 4: `vite.config.ts`에서 키 주입 제거**

파일 전체를 다음으로 교체 (define·loadEnv 삭제, Task 2의 proxy 유지):

```ts
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 5: `index.html` importmap에서 @google/genai 제거**

importmap 스크립트에서 `"@google/genai": "https://esm.sh/@google/genai@^1.38.0",` 한 줄을 삭제한다 (나머지 react 항목 유지).

- [ ] **Step 6: 의존성 제거**

```bash
npm uninstall @google/genai
```

- [ ] **Step 7: `README.md` 실행 안내 갱신**

`## Run Locally` 섹션을 다음으로 교체:

```markdown
## Run Locally

**Prerequisites:**  Node.js 22+

1. Install dependencies:
   `npm install`
2. Create `.env.local` in the project root with your Claude API key
   (server-side only — never bundled into the browser):
   `ANTHROPIC_API_KEY=sk-ant-...`
3. Run the app (Vite dev server + API proxy):
   `npm run dev`
4. Open http://localhost:3000

**Production:** `npm run start` builds the frontend and serves it with
the API proxy on http://localhost:8787.
```

- [ ] **Step 8: 잔재 검증 후 커밋**

```bash
npm run lint && npm test
grep -rn "GEMINI_API_KEY\|@google/genai\|aistudio\|gemini" --include='*.ts' --include='*.tsx' --include='*.html' --include='*.json' . --exclude-dir=node_modules --exclude-dir=.claude --exclude-dir=docs --exclude-dir=.superpowers | grep -v package-lock.json
```

Expected: lint/test 통과. grep 출력 없음(0건). (package-lock.json은 uninstall로 자동 정리되지만 관련 없는 전이 의존성 이름이 걸릴 수 있어 제외.)

```bash
git add -A
git commit -m "chore: remove Gemini and AI Studio remnants

Drops the browser key injection from vite config, the aistudio
key-picker UI and its global declaration, the @google/genai dependency
and importmap entry, and updates the README for the proxy-based setup.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 6: 최종 검증 (lint + 테스트 + 브라우저 E2E) 후 push

**Files:**
- Create (scratchpad, 저장소 밖): `<scratchpad>/verify/verify-migration.mjs`

**배경:** 이 환경에는 실 Claude 키가 없다. 검증 목표는 (a) 서버가 뜨고 `/api`가
에러 JSON을 일관되게 반환, (b) 프론트가 그 에러에서 폴백으로 결정 플로우를
완주, (c) 클라이언트 번들에 어떤 API 키 흔적도 없음 — 세 가지다. 실 응답 품질은
사용자가 로컬(실 키)에서 확인한다.

- [ ] **Step 1: 정적 검증**

```bash
cd /home/user/Arch-Decision-OS
npm run lint && npm test
```
Expected: lint 통과, 24 tests passed

- [ ] **Step 2: dev 기동 (양 프로세스)**

```bash
npm run dev &
sleep 6
curl -s -X POST localhost:3000/api/final-report -H 'content-type: application/json' -d '{"richHistory":"x"}'
```
Expected: Vite(:3000)와 서버(:8787)가 함께 뜨고, Vite 프록시 경유 응답이 `{"error":{...}}` 형태.

- [ ] **Step 3: Playwright E2E (폴백 경로로 완주)**

scratchpad의 기존 playwright 설치를 재사용한다
(`/tmp/claude-0/-home-user-Arch-Decision-OS/3b7b4c86-eec3-5256-ab51-e989676dd43e/scratchpad/verify` —
없으면 `npm init -y && npm install playwright`). `verify-migration.mjs` 생성:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('dialog', d => d.accept());

await page.goto('http://localhost:3000/');
// 키 선택 UI가 제거되었는지 확인
const keyUi = await page.getByText('SELECT API KEY').count();
if (keyUi > 0) throw new Error('FAIL: SELECT API KEY UI still present');

await page.locator('input').first().fill('Migration Test');
await page.getByRole('button', { name: /INITIALIZE/i }).click();

for (let stage = 1; stage <= 7; stage++) {
  const option = page.locator('main .space-y-3 button').first();
  await option.waitFor({ timeout: 60000 });
  await option.click();
  await page.getByRole('button', { name: 'CONFIRM SELECTION' }).click();
}

await page.waitForURL('**/result', { timeout: 30000 });
await page.getByText('Constraint Chain').waitFor({ timeout: 30000 });
await page.screenshot({ path: 'shot-migration-result.png', fullPage: true });

console.log('OK: full decision flow completed via fallback path, key UI removed');
await browser.close();
```

```bash
cd /tmp/claude-0/-home-user-Arch-Decision-OS/3b7b4c86-eec3-5256-ab51-e989676dd43e/scratchpad/verify
node verify-migration.mjs
```
Expected: `OK: ...` 출력. 스크린샷을 Read 도구로 열어 결과 페이지가 렌더됐는지 확인
(Narrative Logic 칸은 에러 문구 폴백 — 정상).

- [ ] **Step 4: 번들 내 키 흔적 검사**

```bash
cd /home/user/Arch-Decision-OS
npm run build
grep -ri "ANTHROPIC_API_KEY\|GEMINI_API_KEY\|sk-ant" dist/ && echo "FAIL: key traces in bundle" || echo "OK: no key traces"
```
Expected: `OK: no key traces`

- [ ] **Step 5: dev 서버 종료, 상태 확인, push**

```bash
kill %1 2>/dev/null
git status --short   # 커밋 안 된 변경이 없어야 함 (.env.local은 gitignored라 안 보임)
git push -u origin claude/architecture-design-os-dev-4meg98
```
Expected: push 성공. (네트워크 오류 시에만 2s/4s/8s/16s 백오프로 최대 4회 재시도.)

---

## Self-Review 결과 (계획 작성 후 점검 완료)

- **스펙 커버리지:** §5(서버 구성)→T1·T2, §6(호출 규약·스키마 변환·domain_vector)→T1·T2, §7(프론트)→T3·T4·T5, §8(설정·의존성·README)→T1·T2·T5, §9(에러 처리)→T2·T3·T4, §10(테스트·검증)→T1·T6. 갭 없음.
- **타입 일관성:** `structuredCall<T>`/`textCall`(T2)의 시그니처를 T2 엔드포인트가 사용; HTTP 계약(T2 Produces)과 T3·T4의 요청 바디 필드명(`previousDecisions`, `historyText`, `richHistory`, `diagramType`, `selectionDetails`, `logicDetails`, `guideHints`, `blueprint`) 일치 확인. `runEP1ProgramTree(blueprint)` 시그니처 T4 내 일치.
- **플레이스홀더:** verbatim 이동 지시(원본 파일·심볼명 명시)는 정확한 앵커가 있는 이동 지시이며 미완성 코드가 아님. 그 외 전부 완전한 코드 포함.
