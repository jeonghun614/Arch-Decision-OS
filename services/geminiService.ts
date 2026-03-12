
import { GoogleGenAI, Type } from "@google/genai";
import { Checkpoint, DecisionLog, EngineOutput, SelectionState, FinalReport, VisualGuide } from "../types";
import { calculateAvailableOptions } from "./logicEngine";
import { DC_LIBRARY } from "../data/staticData";

const GENERATION_SYSTEM_INSTRUCTION = `
너는 "Arch-Decision OS"의 Narrative Interface다.
Logic Engine이 이미 계산한 '가능한 선택지(allowed)'와 '차단된 선택지(blocked)' 정보를 바탕으로,
사용자에게 보여줄 요약 설명과 크리틱 멘트, 다음 행동 지침, 그리고 **AI 추천(Best Pick)**을 생성하라.

규칙:
1. 이미 계산된 선택지(available_options)를 절대 변경하지 말 것.
2. logic_summary는 현재까지의 선택이 어떤 맥락을 만들고 있는지 설명할 것.
3. blocked_options에 대한 설명은 '왜 이 선택이 불가능한지' 논리적으로 서술할 것.
4. **ai_recommendation**: 프로젝트의 이름과 설명(Context), 그리고 현재 단계의 가능한 옵션들을 분석하여, 가장 적합하다고 판단되는 **단 하나의 옵션 ID**와 그 이유를 제시하라.
   - 이유(reason)는 프로젝트의 성격과 해당 옵션의 논리적/공간적 특성을 연결하여 설득력 있게 작성할 것.
   - 만약 정보가 부족하다면 일반적인 관점에서 가장 안전하거나 확장성 있는 옵션을 추천할 것.
5. 모든 텍스트는 한국어로 작성할 것.
6. JSON 포맷을 엄격히 준수할 것.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    logic_summary: { type: Type.STRING },
    critic_ready_statement: { type: Type.ARRAY, items: { type: Type.STRING } },
    do_not_do: { type: Type.ARRAY, items: { type: Type.STRING } },
    next_action: { type: Type.STRING },
    ai_recommendation: {
      type: Type.OBJECT,
      properties: {
        best_option_id: { type: Type.STRING },
        reason: { type: Type.STRING }
      },
      required: ["best_option_id", "reason"]
    }
  },
  required: ["logic_summary", "critic_ready_statement", "do_not_do", "next_action", "ai_recommendation"]
};

const FINAL_REPORT_INSTRUCTION = `
너는 건축 설계 의사결정 운영체제(ARCH-DECISION OS)의 고급 커널이다.
사용자가 선택한 설계 결정(Decision Logs)과 각 선택지가 가진 **구조적 속성(Attributes/Axes)**을 분석하여, 이 프로젝트의 **"최종 공간 논리 해설(Design Logic Explanation)"**을 생성하라.

**작성 원칙 (Tone & Manner):**
1. **설계 논문의 'Design Concept' 섹션**처럼 작성하라.
2. 단순한 나열이 아닌, **"A를 선택했기 때문에 논리적으로 B가 필연적이었다"**는 인과관계(Causality)를 강조하라.
3. 감상적 형용사(아름다운, 좋은)를 배제하고, **공간적 작동 원리(작동, 제어, 분리, 연결 등)**를 서술하라.
4. 제공된 '속성(Attributes)' 데이터(예: Exposure: LOW, Centrality: LINEAR)를 근거로 삼아라.

**필수 섹션 및 작성 가이드:**

1. **core_logic (핵심 설계 논리)**
   - 프로젝트가 정의한 '문제(DC1)'와 이를 해결하기 위한 '공간적 태도(DC2)'를 하나의 문단으로 요약하라.
   - 예: "관계의 피로를 해결하기 위해(DC1), 공간은 이분법적 단절 대신 점진적인 스펙트럼(DC2)을 통해 거주자에게 사회적 거리 조절권을 부여한다."

2. **causality (결정 간 인과관계 - Constraint Chain)**
   - 상위 결정(DC1, DC2)이 하위 결정(DC5, DC3, DC4)을 어떻게 '구속(Lock-in)'했는지 설명하라.
   - 각 단계의 선택이 왜 논리적 필연이었는지 설명하라.
   - 예: "프라이버시 보호(DC1)를 위해 노출을 최소화해야 했으므로(Attribute), 순환형 동선 대신 선택적 우회 동선(DC5)이 채택되었으며, 이는 자연스럽게 분산된 매스 형태(DC4)로 귀결되었다."

3. **user_scenario (공간 경험 시나리오)**
   - 가상의 사용자가 공간에 진입하여 점유하는 과정을 '1인칭 시점'이 아닌 **'전지적 설계자 시점'**에서 묘사하라.
   - 사용자가 공간 시스템과 상호작용하는 방식을 서술하라.

4. **excluded_tradeoffs (의도적 배제와 기회비용)**
   - 이 설계가 **'무엇이 되지 않기로 했는지'** 명확히 하라.
   - 선택되지 않은 대안(강제적 교류, 중앙집중형 효율성 등)이 왜 이 프로젝트의 논리에 맞지 않아 배제되었는지 역설적으로 설명하여 설계 의도를 강화하라.
   - 예: "이 프로젝트는 효율적인 중앙 집중 관리를 의도적으로 포기했다. 대신..."
`;

const FINAL_REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    core_logic: { type: Type.STRING },
    causality: { type: Type.STRING },
    user_scenario: { type: Type.STRING },
    excluded_tradeoffs: { type: Type.STRING }
  },
  required: ["core_logic", "causality", "user_scenario", "excluded_tradeoffs"]
};

const VISUAL_GUIDE_INSTRUCTION = `
너는 건축 설계 스튜디오의 튜터다.
사용자가 선택한 결정(Decision)에 대해 단순한 '그리기 방법'이 아닌, **"심층적인 논리 구조와 설계 전략"**을 지도하라.

작성 규칙:
1. **Logic Structure (논리 구조)**: 이 선택이 공간, 동선, 시선, 시간을 어떻게 조직하는지 건축학적으로 깊이 있고 논리적으로 설명하라. 단순한 묘사가 아니라 '작동 원리'를 서술하라. 가독성을 위해 개조식으로 작성하라.
2. **Design Strategies (추천 전략)**: 이 논리를 강화하기 위해 적용하면 좋은 구체적인 건축적 장치, 재료, 레벨 계획, 배치 전략 등을 제안하라. (예: "물리적 벽 대신 바닥의 단차(Skip-floor)를 활용하여 영역을 구분하라.")
3. **Prohibitions (금지 사항)**: 이 논리를 무너뜨리는 모순된 설계 행위나 피해야 할 구성을 경고하라. (예: "개방성을 지향하면서 폐쇄적인 중복도 시스템을 사용하지 마라.")
4. **Presentation Speech**: 크리틱 발표용 대본(한 문장). 전문적인 어휘를 사용하라.
`;

const VISUAL_GUIDE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    core_message: { type: Type.STRING },
    logic_structure: { type: Type.ARRAY, items: { type: Type.STRING } },
    design_strategies: { type: Type.ARRAY, items: { type: Type.STRING } },
    prohibitions: { type: Type.ARRAY, items: { type: Type.STRING } },
    presentation_speech: { type: Type.STRING }
  },
  required: ["title", "core_message", "logic_structure", "design_strategies", "prohibitions", "presentation_speech"]
};

const DIAGRAM_TYPES: Record<Checkpoint, string> = {
  [Checkpoint.DC1]: "Problem Field (문제 분포)",
  [Checkpoint.DC2]: "Spatial Attitude (공간 태도)",
  [Checkpoint.DC5]: "Circulation Sequence (동선 구조)",
  [Checkpoint.DC3]: "Program Operation (운영 방식)",
  [Checkpoint.DC4]: "Massing Strategy (매스 전략)",
  [Checkpoint.DC6]: "Structural Logic (구조 논리)",
  [Checkpoint.DC7]: "Expression Logic (표현 논리)"
};

// Helper to find option details including axes
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
  
  // For DC2 and DC5, the ID in library is 'type', for others it's 'id'
  const match = list.find(o => (o.id === id || o.type === id));
  if (!match) return null;

  // Extract logic attributes to help AI reasoning
  const attributes: any = {};
  if (match.engine_axes) attributes.axes = match.engine_axes;
  if (match.bias_axis_pref) attributes.preference = match.bias_axis_pref;
  if (match.anti_axis_forbid) attributes.forbid = match.anti_axis_forbid;
  
  return { label: match.label, attributes };
}

export async function runKernel(
  checkpoint: Checkpoint,
  selections: SelectionState,
  decisionHistory: DecisionLog[],
  projectContext?: { name: string; description: string }
): Promise<EngineOutput> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please select an API key.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const { allowed, blocked } = calculateAvailableOptions(checkpoint, selections);

  const model = "gemini-2.5-flash";

  const historyText = decisionHistory.map(l => {
    const val = Array.isArray(l.selectedLabel) ? l.selectedLabel.join(" + ") : l.selectedLabel;
    return `[${l.checkpoint}] ${val}`;
  }).join("\n");

  const inputPayload = {
    project_context: projectContext || { name: "Unknown", description: "No description provided." },
    current_stage: checkpoint,
    previous_decisions: {
        DC1: selections.dc1_id,
        DC2: selections.dc2_type,
        DC5: selections.dc5_types.join(" + "), 
        DC3: selections.dc3_ids.join(", "),
        DC4: selections.dc4_ids.join(", "),
        DC6: selections.dc6_ids.join(", "),
        DC7: selections.dc7_ids.join(", ")
    },
    calculated_available_options: allowed.map(o => `${o.id}: ${o.label} (${o.status})`).join("\n"),
    calculated_blocked_options: blocked.map(o => `${o.id}: ${o.label} [BLOCKED by ${o.blocked_by.join(',')}]`).join("\n")
  };

  const contents = `
    LOGIC ENGINE OUTPUT:
    ${JSON.stringify(inputPayload, null, 2)}
    
    HISTORY:
    ${historyText}

    TASK:
    Generate the narrative fields including the AI recommendation based on the project context and available options.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: GENERATION_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const textPart = JSON.parse(response.text);

    return {
      current_stage: checkpoint,
      available_options: allowed,
      blocked_options: blocked,
      logic_summary: textPart.logic_summary,
      critic_ready_statement: textPart.critic_ready_statement,
      do_not_do: textPart.do_not_do,
      next_action: textPart.next_action,
      ai_recommendation: textPart.ai_recommendation
    };

  } catch (error) {
    console.error("Kernel Error:", error);
    const raw = error instanceof Error ? error.message : String(error);
    let userMsg = "AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    if (raw.includes('free_tier') && raw.includes('limit: 0')) {
      userMsg = "이 API 키는 결제가 활성화된 프로젝트에서 발급되어 무료 할당량이 0입니다. aistudio.google.com/apikey 에서 '새 프로젝트에 API 키 만들기'로 새 키를 발급하세요.";
    } else if (raw.includes('"code":429') || raw.includes('RESOURCE_EXHAUSTED')) {
      userMsg = "API 일일 사용량을 초과했습니다. 내일 다시 시도하거나 새 API 키를 발급하세요.";
    } else if (raw.includes('"code":404') || raw.includes('NOT_FOUND')) {
      userMsg = "AI 모델을 찾을 수 없습니다. 개발자에게 문의해주세요.";
    } else if (raw.includes('API Key') || raw.includes('API_KEY')) {
      userMsg = "API 키가 없거나 잘못되었습니다. .env 파일을 확인해주세요.";
    }
    return {
      current_stage: checkpoint,
      available_options: allowed,
      blocked_options: blocked,
      logic_summary: userMsg,
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";

  // Build a rich history object with attributes
  const richHistory = decisionHistory.map(l => {
    const ids = Array.isArray(l.selectedId) ? l.selectedId : [l.selectedId];
    const details = ids.map(id => {
       const info = getOptionDetails(l.checkpoint, id);
       return info ? `${info.label} (Attributes: ${JSON.stringify(info.attributes)})` : id;
    }).join(" + ");
    
    return `[${l.checkpoint}] SELECTED: ${details}`;
  }).join("\n\n");

  const contents = `
    PROJECT CONTEXT:
    Name: ${projectContext?.name || "Unknown"}
    Description: ${projectContext?.description || "No description"}

    FULL DECISION HISTORY WITH LOGIC ATTRIBUTES:
    ${richHistory}

    TASK:
    Synthesize the final architectural logic report.
    Use the provided 'Attributes' to explain the *mechanics* of the decision chain (why X led to Y).
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: FINAL_REPORT_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: FINAL_REPORT_SCHEMA
      }
    });
    return JSON.parse(response.text) as FinalReport;
  } catch (error) {
    console.error("Final Report Generation Error:", error);
    const raw = error instanceof Error ? error.message : String(error);
    let msg = "결과 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
    if (raw.includes('"code":429') || raw.includes('RESOURCE_EXHAUSTED')) {
      msg = "API 사용량 한도 초과. 새 API 키(결제 없는 프로젝트)로 교체하거나 내일 다시 시도해주세요.";
    } else if (raw.includes('"code":404') || raw.includes('NOT_FOUND')) {
      msg = "AI 모델을 찾을 수 없습니다. 모델명 설정을 확인해주세요.";
    }
    return {
      core_logic: msg,
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";

  const targetDiagramType = DIAGRAM_TYPES[checkpoint];
  
  // Prepare details
  const ids = Array.isArray(selection.id) ? selection.id : [selection.id];
  const labels = Array.isArray(selection.label) ? selection.label : [selection.label];
  
  const selectionDetails = ids.map((id, idx) => {
       const info = getOptionDetails(checkpoint, id);
       return info ? `${info.label} (Logic Attributes: ${JSON.stringify(info.attributes)})` : labels[idx];
  }).join(" + ");

  const contents = `
    PROJECT CONTEXT:
    Name: ${projectContext.name}
    Description: ${projectContext.description}

    TARGET DIAGRAM TYPE: ${targetDiagramType}
    SELECTED DECISION: ${selectionDetails}

    TASK:
    Provide deep architectural logic analysis and strategic guidelines for this decision.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: VISUAL_GUIDE_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: VISUAL_GUIDE_SCHEMA
      }
    });
    return JSON.parse(response.text) as VisualGuide;
  } catch (error) {
    console.error("Visual Guide Generation Error:", error);
    return {
      title: "Error Generating Guide",
      core_message: "가이드를 생성하는 중 오류가 발생했습니다.",
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
  // Use flash model to generate text prompt
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";
  
  const ids = Array.isArray(selection.id) ? selection.id : [selection.id];
  const labels = Array.isArray(selection.label) ? selection.label : [selection.label];
  
  const logicDetails = ids.map((id, idx) => {
       const info = getOptionDetails(checkpoint, id);
       const axisInfo = info?.attributes?.axes ? JSON.stringify(info.attributes.axes) : "";
       return `Selected Concept: ${info?.label || labels[idx]}. Logic Attributes: ${axisInfo}`;
  }).join(" + ");

  // Provide visual guide hints if available
  const guideHints = visualGuideData 
    ? `
      Architectural Strategies to Visualize:
      - Logic Structure: ${visualGuideData.logic_structure.join("; ")}
      - Key Strategies: ${visualGuideData.design_strategies.join("; ")}
      - Avoid: ${visualGuideData.prohibitions.join("; ")}
      `
    : "";

  const contents = `
    You are an expert prompt engineer for advanced architectural AI image generators (like Midjourney, Nano Banana, or Stable Diffusion).
    
    PROJECT: ${projectContext.name}
    DESCRIPTION: ${projectContext.description}
    ARCHITECTURAL LOGIC: ${logicDetails}
    ${guideHints}

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

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
    });
    
    return response.text.trim();

  } catch (error) {
    console.error("Prompt Generation Error:", error);
    return "프롬프트 생성 중 오류가 발생했습니다. 다시 시도해주세요.";
  }
}
