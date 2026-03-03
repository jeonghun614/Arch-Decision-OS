import { EP1ProgramTree, EP2Output, EP2VoidNode, BlueprintJSON } from "../types";
import { runFootprintDeductionEngine, BuildingInfo } from "./ep2/footprintEngine";
import { runVerticalVisibilityEngine } from "./ep2/verticalVisibilityEngine";
import { runAdjacencyModifierEngine } from "./ep2/adjacencyModifierEngine";

// EP2 규칙 JSON 정적 임포트
import footprintRules from "../data/ep2/rules/footprint.rules.json";
import verticalVisibilityRules from "../data/ep2/rules/vertical-visibility.rules.json";
import adjacencyModifierRules from "../data/ep2/rules/adjacency-modifier.rules.json";
import spanFloorRules from "../data/ep2/rules/span-floor.rules.json";

/**
 * EP1 Program Tree의 VOID 카테고리 공간으로부터 VoidNode를 자동 생성한다.
 */
function deriveVoidNodes(programTree: EP1ProgramTree, blueprint: BlueprintJSON): EP2VoidNode[] {
  const voidSpaces = programTree.spaces.filter((s) => s.category_label === "VOID");
  if (voidSpaces.length === 0) return [];

  const floors = blueprint.inputs.floors;
  const nodes: EP2VoidNode[] = [];

  voidSpaces.forEach((space, idx) => {
    const voidId = `VOID-${String(idx + 1).padStart(3, "0")}`;

    // void_type 결정: space_type에서 추론
    const typeMap: Record<string, EP2VoidNode["void_type"]> = {
      ATRIUM: "ATRIUM",
      COURTYARD: "COURTYARD_VOID",
      COURTYARD_VOID: "COURTYARD_VOID",
      LIGHT_WELL: "LIGHT_WELL",
      LIGHTWELL: "LIGHT_WELL",
      DOUBLE_HEIGHT: "DOUBLE_HEIGHT",
      MEZZANINE: "MEZZANINE_OVERLAP",
      RAMP: "RAMP_CONTINUUM",
      HIGH_BAY: "INDUSTRIAL_HIGH_BAY",
    };
    const voidType: EP2VoidNode["void_type"] =
      typeMap[space.space_type?.toUpperCase()] ?? "ATRIUM";

    // span 결정: 공간의 placement.span 또는 span_floor_rules 기반 fallback
    const fromFloor = space.placement.span.from_floor;
    const toFloor = space.placement.span.type === "MULTI_LEVEL"
      ? space.placement.span.to_floor
      : Math.min(fromFloor + 1, floors); // VOID는 최소 2층 span

    // 인접 공간(anchor)은 같은 층에 배치된 비-VOID 공간들
    const anchorSpaces = programTree.spaces
      .filter(
        (s) =>
          s.category_label !== "VOID" &&
          s.placement.floor_preference.preferred.some(
            (f) => f >= fromFloor && f <= toFloor
          )
      )
      .slice(0, 10)
      .map((s) => s.id);

    nodes.push({
      void_id: voidId,
      void_type: voidType,
      span: {
        start_floor: fromFloor,
        end_floor: toFloor,
        span_count: toFloor - fromFloor + 1,
      },
      footprint: {
        mode: "RATIO",
        value: space.area.total_m2 / (blueprint.computed.footprint_m2 || 1),
        counts_as_gfa: false,
      },
      anchors: { anchor_spaces: anchorSpaces },
      effects: {
        vertical_visibility: { enabled: true, weight: 1.0, multiplier: 1.0 },
        adjacency_modifier: { enabled: true, delta_V: 0.5, delta_A: 0.5 },
      },
    });
  });

  return nodes;
}

/**
 * EP2 전체 파이프라인 실행:
 * 1) VoidNode 생성 (EP1 VOID 공간에서 파생)
 * 2) Footprint 차감 엔진
 * 3) Vertical Visibility 엔진
 * 4) Adjacency Modifier 엔진
 */
export function runEP2Pipeline(
  programTree: EP1ProgramTree,
  blueprint: BlueprintJSON
): EP2Output {
  const selectedPatterns = programTree.selected_patterns || [];
  const floors = blueprint.inputs.floors;
  const footprintM2 = blueprint.computed.footprint_m2;

  // Building 정보 구성
  const building: BuildingInfo = {
    floors_total: floors,
    ground_floor_index: 1,
    floor_plates: {
      mode: "ONE_PLATE",
      default_plate_area_m2: footprintM2,
    },
  };

  // VoidNode 파생
  const voidNodes = deriveVoidNodes(programTree, blueprint);

  // EP2-3: Footprint 차감
  const footprintResult = runFootprintDeductionEngine({
    ep1: programTree,
    building,
    voidNodes,
    footprintRules: footprintRules as Record<string, any>,
    selectedPatterns,
  });

  // EP2-4: Vertical Visibility
  const visibilityResult = runVerticalVisibilityEngine({
    ep1: programTree,
    voidNodes,
    visibilityRules: verticalVisibilityRules as Record<string, any>,
    selectedPatterns,
  });

  // EP2-5: Adjacency Modifier
  const adjacencyResult = runAdjacencyModifierEngine({
    ep1: programTree,
    voidNodes,
    adjacencyRules: adjacencyModifierRules as Record<string, any>,
    selectedPatterns,
  });

  // 경고 합산
  const warnings = [
    ...footprintResult.warnings,
    ...visibilityResult.warnings.map((w) => ({ ...w, floor: null })),
    ...adjacencyResult.warnings.map((w) => ({ ...w, floor: null })),
  ];

  // relation_modifiers 합산
  const relation_modifiers = [
    ...visibilityResult.relation_modifiers,
    ...adjacencyResult.relation_modifiers,
  ];

  return {
    void_nodes: voidNodes,
    footprint_adjustments: footprintResult.footprint_adjustments,
    relation_modifiers,
    usable_area_by_floor: footprintResult.usable_area_by_floor,
    warnings,
  };
}
