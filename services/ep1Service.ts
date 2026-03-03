import { GoogleGenAI, Type } from "@google/genai";
import { BlueprintJSON, EP1ProgramTree } from "../types";

// EP1 규칙 JSON 정적 임포트 (Vite가 번들링)
import domainVectorRules from "../data/ep1/domain-vector.rules.json";
import patternLibrary from "../data/ep1/pattern-library.json";
import patternLibraryPatch from "../data/ep1/pattern-library-patch.json";
import patternCompositionRules from "../data/ep1/pattern-composition.rules.json";
import clusterRules from "../data/ep1/cluster.rules.json";
import programDataModel from "../data/ep1/program-data-model.json";
import areaScalingRules from "../data/ep1/area-scaling.rules.json";
import spaceMinAreaRules from "../data/ep1/space-min-area.rules.json";
import relationAutoGenRules from "../data/ep1/relation-auto-generation.rules.json";

const EP1_SYSTEM_INSTRUCTION = `
너는 건축 프로그램 생성 엔진이다.
주어진 BlueprintJSON(DC1~DC7 의사결정 결과)과 EP1 규칙 세트를 바탕으로,
건물의 구체적인 Program Tree를 생성하라.

Program Tree는 다음 계층 구조를 따른다:
Category(L1) → Cluster(L2) → Space(L3)

규칙:
1. BlueprintJSON.computed.gross_floor_area_m2를 총 GFA로 사용하라.
2. BlueprintJSON.grammar.program.base_ratios로 카테고리별 면적 비율을 결정하라.
3. EP1 Pattern Library에서 선택된 패턴들의 cluster_templates를 기반으로 클러스터를 생성하라.
4. 각 Space는 space_type, category_label, cluster_id, quantity, area(each_m2, total_m2), placement(floor_preference, span)를 반드시 포함하라.
5. 층수(BlueprintJSON.inputs.floors)와 사이트 조건에 맞게 floor_preference를 배분하라.
6. Space ID는 SP-0001부터 순차 부여, Cluster ID는 CLU-001부터 부여하라.
7. Relation graph는 EP1 Relation auto-generation 규칙에 따라 DIRECT_ACCESS/ADJACENT/NEAR/SEPARATE 엣지를 생성하라.
8. 모든 면적의 합은 gross_floor_area_m2의 ±5% 이내여야 한다.
9. JSON 포맷을 엄격히 준수하라.
`;

const EP1_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    spaces: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          space_type: { type: Type.STRING },
          category_label: { type: Type.STRING },
          cluster_id: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          area: {
            type: Type.OBJECT,
            properties: {
              each_m2: { type: Type.NUMBER },
              total_m2: { type: Type.NUMBER },
              net_or_gross: { type: Type.STRING },
            },
            required: ["each_m2", "total_m2", "net_or_gross"],
          },
          placement: {
            type: Type.OBJECT,
            properties: {
              floor_preference: {
                type: Type.OBJECT,
                properties: {
                  preferred: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  avoid: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                  min_floor: { type: Type.INTEGER },
                  max_floor: { type: Type.INTEGER },
                },
                required: ["preferred", "avoid", "min_floor", "max_floor"],
              },
              span: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  from_floor: { type: Type.INTEGER },
                  to_floor: { type: Type.INTEGER },
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
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          category_label: { type: Type.STRING },
          weight: { type: Type.NUMBER },
          space_kits: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["id", "name", "category_label", "weight", "space_kits"],
      },
    },
    relations: {
      type: Type.OBJECT,
      properties: {
        graph: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  space_id: { type: Type.STRING },
                  category_label: { type: Type.STRING },
                },
                required: ["space_id", "category_label"],
              },
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  from: { type: Type.STRING },
                  to: { type: Type.STRING },
                  relation_type: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
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
    selected_patterns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    domain_vector: { type: Type.OBJECT },
  },
  required: ["spaces", "clusters", "relations", "selected_patterns", "domain_vector"],
};

export async function runEP1ProgramTree(
  blueprint: BlueprintJSON,
  apiKey: string
): Promise<EP1ProgramTree> {
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash-preview-04-17";

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

  const userPrompt = `
=== INPUT: BLUEPRINT JSON (DC1~DC7 결과) ===
${JSON.stringify(blueprint, null, 2)}

위 BlueprintJSON과 EP1 규칙을 사용하여 구체적인 Program Tree를 생성하라.
총 GFA: ${blueprint.computed.gross_floor_area_m2}m²
층수: ${blueprint.inputs.floors}층
사이트 면적: ${blueprint.computed.site_area_m2}m²
`;

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: EP1_SYSTEM_INSTRUCTION + "\n\n" + ep1Context,
      responseMimeType: "application/json",
      responseSchema: EP1_RESPONSE_SCHEMA,
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error("EP1: Gemini returned empty response.");

  return JSON.parse(text) as EP1ProgramTree;
}
