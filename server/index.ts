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

// express.json()의 SyntaxError 등 라우트 바깥에서 발생한 오류도
// {error:{status,message}} JSON 계약을 지키게 한다
const jsonErrorHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  const message =
    status === 400
      ? "요청 본문이 올바른 JSON이 아닙니다."
      : err instanceof Error
        ? err.message
        : "알 수 없는 서버 오류";
  res.status(status).json({ error: { status, message } });
};
app.use(jsonErrorHandler);

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[server] ANTHROPIC_API_KEY 미설정 — /api 요청은 500을 반환합니다");
  }
});
