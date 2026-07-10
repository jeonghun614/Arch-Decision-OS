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

// ── getOptionDetails: 원본 서비스 모듈의 동명 함수를 그대로 이동 (무변경) ──
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
