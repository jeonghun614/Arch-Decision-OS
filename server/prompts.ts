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

export const KERNEL_SYSTEM = `
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

export const FINAL_REPORT_SYSTEM = `
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

export const VISUAL_GUIDE_SYSTEM = `
너는 건축 설계 스튜디오의 튜터다.
사용자가 선택한 결정(Decision)에 대해 단순한 '그리기 방법'이 아닌, **"심층적인 논리 구조와 설계 전략"**을 지도하라.

작성 규칙:
1. **Logic Structure (논리 구조)**: 이 선택이 공간, 동선, 시선, 시간을 어떻게 조직하는지 건축학적으로 깊이 있고 논리적으로 설명하라. 단순한 묘사가 아니라 '작동 원리'를 서술하라. 가독성을 위해 개조식으로 작성하라.
2. **Design Strategies (추천 전략)**: 이 논리를 강화하기 위해 적용하면 좋은 구체적인 건축적 장치, 재료, 레벨 계획, 배치 전략 등을 제안하라. (예: "물리적 벽 대신 바닥의 단차(Skip-floor)를 활용하여 영역을 구분하라.")
3. **Prohibitions (금지 사항)**: 이 논리를 무너뜨리는 모순된 설계 행위나 피해야 할 구성을 경고하라. (예: "개방성을 지향하면서 폐쇄적인 중복도 시스템을 사용하지 마라.")
4. **Presentation Speech**: 크리틱 발표용 대본(한 문장). 전문적인 어휘를 사용하라.
`;

const EP1_SYSTEM_INSTRUCTION = `
너는 건축 프로그램 생성 엔진이다.
주어진 BlueprintJSON(DC1~DC7 의사결정 결과)과 EP1 규칙 세트를 바탕으로,
건물의 구체적인 Program Tree를 생성하라.

Program Tree는 다음 계층 구조를 따른다:
Category(L1) → Cluster(L2) → Space(L3)

규칙:
1. BlueprintJSON.computed.gross_floor_area_mm2를 총 GFA로 사용하라. (단위: mm²)
2. BlueprintJSON.grammar.program.base_ratios로 카테고리별 면적 비율을 결정하라.
3. EP1 Pattern Library에서 선택된 패턴들의 cluster_templates를 기반으로 클러스터를 생성하라.
4. 각 Space는 space_type, category_label, cluster_id, quantity, area(each_mm2, total_mm2), placement(floor_preference, span)를 반드시 포함하라. (면적 단위: mm²)
5. 층수(BlueprintJSON.inputs.floors)와 사이트 조건에 맞게 floor_preference를 배분하라.
6. Space ID는 SP-0001부터 순차 부여, Cluster ID는 CLU-001부터 부여하라.
7. Relation graph는 EP1 Relation auto-generation 규칙에 따라 DIRECT_ACCESS/ADJACENT/NEAR/SEPARATE 엣지를 생성하라.
8. 모든 면적의 합은 gross_floor_area_m2의 ±5% 이내여야 한다.
9. JSON 포맷을 엄격히 준수하라.
`;

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
