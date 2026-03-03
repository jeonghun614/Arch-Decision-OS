
export enum Checkpoint {
  DC1 = "DC1",
  DC2 = "DC2",
  DC5 = "DC5",
  DC3 = "DC3",
  DC4 = "DC4",
  DC6 = "DC6",
  DC7 = "DC7"
}

export type AxisName = "Exposure" | "Encounter" | "Access" | "Sharing" | "Temporal" | "Separation" | "Centrality" | "Mass" | "Expression";

export type AxisMap = Partial<Record<AxisName, string>>;

export interface AxisProfile {
  bias_axis_pref: AxisMap;
  anti_axis_forbid: AxisMap;
}

export interface EngineOption {
  id: string; // or 'type' for DC2/DC5
  label: string;
  engine_axes?: AxisMap; // DC1 doesn't have this, others do
  display_tags?: string[]; // For UI display only
  
  // Specific to DC1
  bias_axis_pref?: AxisMap;
  anti_axis_forbid?: AxisMap;
}

export interface OptionStatus {
  id: string;
  label: string;
  status: "allowed" | "warning";
  warning_reason: string | null;
  display_tags: string[];
  score?: number; // For debugging/sorting
}

export interface BlockedOption {
  id: string;
  label: string;
  blocked_by: string[];
  reason: string;
}

export interface EngineOutput {
  current_stage: string;
  available_options: OptionStatus[];
  blocked_options: BlockedOption[];
  logic_summary: string;
  critic_ready_statement: string[];
  do_not_do: string[];
  next_action: string;
  ai_recommendation?: {
    best_option_id: string;
    reason: string;
  };
}

export interface SelectionState {
  dc1_id: string | null;
  dc2_type: string | null;
  dc5_types: string[]; // Changed to array
  dc3_ids: string[];   // Changed to array
  dc4_ids: string[];   // Changed to array
  dc6_ids: string[];   // Changed to array
  dc7_ids: string[];   // Changed to array
}

export interface DecisionLog {
  checkpoint: Checkpoint;
  selectedId: string | string[]; // Can be single or array
  selectedLabel: string | string[];
  timestamp: number;
}

export interface FinalReport {
  core_logic: string;
  causality: string;
  user_scenario: string;
  excluded_tradeoffs: string;
}

export interface VisualGuide {
  title: string;
  core_message: string;
  logic_structure: string[];    // Detailed explanation of the logic
  design_strategies: string[];  // What to do (Recommendations)
  prohibitions: string[];       // What NOT to do
  presentation_speech: string;
}

export interface SiteInputs {
  site_width_m: number;
  site_depth_m: number;
  coverage_ratio: number;
  floors: number;
  floor_to_floor_mm: number;
  efficiency_ratio: number;
}

export interface SpatialGrammar {
  topology: {
    type: string;
    cluster_count_range: [number, number];
    centrality: string;
  };
  buffer: {
    strategy: string;
    require_buffer_between_private_shared: boolean;
    forbid_direct_private_shared: boolean;
    insert_buffer_field_if: {
      visibility_gte: number;
      adjacency_lte: number;
    };
  };
  circulation: {
    type: string;
    min_routes: number;
    shared_not_gate: boolean;
    optional_detour: boolean;
    time_layered: boolean;
    staged_entry: boolean;
    skip_access: boolean;
  };
  visibility_control: {
    target_range: [number, number];
    devices: string[];
  };
  structural_logic: {
    system: string;
    grid_based: boolean;
    expandable: boolean;
    core_dominant: boolean;
    wall_dominant: boolean;
    independent_modules: boolean;
  };
  expression_logic: {
    language: string;
    opacity_range: [number, number];
    material_coding: boolean;
    rhythm: string;
  };
  program: {
    area_bias: Record<string, number>;
    base_ratios: Record<string, number>;
  };
  relations: {
    score_model: {
      formula: string;
      visibility_scale: [number, number];
      adjacency_scale: [number, number];
    };
    forbid_pairs: string[][];
    shared_min_adjacency: number | null;
  };
  [key: string]: any;
}

// ─────────────────────────────────────────────
// EP1 Program Tree 타입
// ─────────────────────────────────────────────

export interface EP1Space {
  id: string;                   // SP-XXXX
  name: string;
  space_type: string;
  category_label: 'PRIMARY' | 'PRIVATE' | 'SHARED' | 'BUFFER' | 'SERVICE' | 'CIRCULATION' | 'VOID';
  cluster_id: string;           // CLU-XXX
  quantity: number;
  area: {
    each_m2: number;
    total_m2: number;
    net_or_gross: 'NET' | 'GROSS';
  };
  placement: {
    floor_preference: { preferred: number[]; avoid: number[]; min_floor: number; max_floor: number };
    span: { type: 'SINGLE_FLOOR' | 'MULTI_LEVEL'; from_floor: number; to_floor: number };
  };
}

export interface EP1Cluster {
  id: string;                   // CLU-XXX
  name: string;
  category_label: string;
  weight: number;
  space_kits: string[];
}

export interface EP1RelationEdge {
  from: string;
  to: string;
  relation_type: string;
  score: number;
  reason?: string;
}

export interface EP1ProgramTree {
  spaces: EP1Space[];
  clusters: EP1Cluster[];
  relations: {
    graph: {
      nodes: { space_id: string; category_label: string }[];
      edges: EP1RelationEdge[];
    };
  };
  selected_patterns: string[];
  domain_vector: Record<string, any>;
}

// ─────────────────────────────────────────────
// EP2 Void & 엔진 출력 타입
// ─────────────────────────────────────────────

export interface EP2VoidNode {
  void_id: string;              // VOID-XXX
  void_type: 'COURTYARD_VOID' | 'ATRIUM' | 'DOUBLE_HEIGHT' | 'INDUSTRIAL_HIGH_BAY' | 'RAMP_CONTINUUM' | 'LIGHT_WELL' | 'MEZZANINE_OVERLAP';
  span: { start_floor: number; end_floor: number; span_count?: number };
  footprint: { mode: 'RATIO' | 'AREA_M2' | 'BY_SPACE_SET'; value: number; counts_as_gfa: boolean };
  anchors: { anchor_spaces: string[] };
  effects: {
    vertical_visibility: { enabled: boolean; weight: number; multiplier: number };
    adjacency_modifier: { enabled: boolean; delta_V: number; delta_A: number };
  };
}

export interface EP2FootprintAdjustment {
  floor: number;
  void_id: string;
  void_type: string;
  plate_area_m2: number;
  deduct_area_m2: number;
  remaining_usable_m2: number;
  deduct_mode: string;
  effective_value: number;
  counts_as_gfa: boolean;
}

export interface EP2RelationModifier {
  type: 'VERTICAL_VISIBILITY' | 'ADJACENCY_MODIFIER';
  void_id: string;
  from_space_id: string;
  to_space_id: string;
  delta_V_vertical?: number;
  delta_A?: number;
  delta_R?: number;
  meta: Record<string, any>;
}

export interface EP2Output {
  void_nodes: EP2VoidNode[];
  footprint_adjustments: EP2FootprintAdjustment[];
  relation_modifiers: EP2RelationModifier[];
  usable_area_by_floor: Record<number, number | null>;
  warnings: Array<{ void_id: string | null; floor?: number | null; code: string; message: string }>;
}

// ─────────────────────────────────────────────

export interface BlueprintJSON {
  inputs: SiteInputs;
  logic_trace: {
    dc_choices: { checkpoint: string; id: string | string[]; label: string | string[] }[];
    axis_profile?: Record<string, any>;
    applied_rules?: string[];
  };
  computed: {
    site_area_m2: number;
    footprint_m2: number;
    gross_floor_area_m2: number;
    net_program_area_m2: number;
    levels: { level: string; elevation_mm: number }[];
  };
  grammar: SpatialGrammar;
  blueprint: {
    programs: {
      id: string;
      type: string;
      label: string;
      area_target_m2: number;
    }[];
    relations: {
      edges: { from: string; to: string; visibility: number; adjacency: number; r_score: number }[];
    };
    allocation: {
      floor_assignment: { floor: number; program_ids: string[] }[];
    };
    geometry_ir: {
      grid: { cell_mm: number };
      voids: { x: number; y: number; w: number; h: number }[];
      zones: any[];
      massing: any[];
    };
  };
  // EP1: 구체적 프로그램 트리 (Gemini + EP1 규칙으로 생성)
  program_tree?: EP1ProgramTree;
  // EP2: Void 효과 계산 결과 (JS 엔진으로 생성)
  ep2?: EP2Output;
}

export interface ProjectState {
  projectName: string;
  projectDescription: string;
  siteInputs: SiteInputs;
  currentCheckpoint: Checkpoint;
  selections: SelectionState;
  logs: DecisionLog[];
  lastEngineOutput: EngineOutput | null;
  completed: boolean;
  finalReport: FinalReport | null;
  grammarResult: BlueprintJSON | null;
  ep1Status: 'idle' | 'loading' | 'done' | 'error';
  ep2Status: 'idle' | 'loading' | 'done' | 'error';
}

export const CHECKPOINT_ORDER = [
  Checkpoint.DC1,
  Checkpoint.DC2,
  Checkpoint.DC5,
  Checkpoint.DC3,
  Checkpoint.DC4,
  Checkpoint.DC6,
  Checkpoint.DC7
];

export const CHECKPOINT_LABELS: Record<Checkpoint, string> = {
  [Checkpoint.DC1]: "Problem Commitment (과제 정의)",
  [Checkpoint.DC2]: "Spatial Attitude (공간 태도)",
  [Checkpoint.DC5]: "Behavioral Sequence (동선 시퀀스)",
  [Checkpoint.DC3]: "Program Operation (운영 방식)",
  [Checkpoint.DC4]: "Physical Consequence (매스 전략)",
  [Checkpoint.DC6]: "Structural Proof (구조 논리)",
  [Checkpoint.DC7]: "Communicative Readability (표현 방식)"
};

export const CHECKPOINT_LIMITS: Record<Checkpoint, number> = {
  [Checkpoint.DC1]: 1,
  [Checkpoint.DC2]: 1,
  [Checkpoint.DC5]: 2, // Primary + Secondary
  [Checkpoint.DC3]: 2,
  [Checkpoint.DC4]: 2,
  [Checkpoint.DC6]: 2,
  [Checkpoint.DC7]: 2
};
