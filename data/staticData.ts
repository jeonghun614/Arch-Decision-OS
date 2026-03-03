
import { AxisMap } from "../types";

export const DC_LIBRARY = {
  axis_schema: { AX1: "Exposure", AX2: "Encounter", AX3: "Access", AX4: "Sharing", AX5: "Temporal", AX6: "Separation", AX7: "Centrality", AX8: "Mass", AX9: "Expression" },
  
  dc1_options: [
    { id: "DC1-01", label: "관계 피로 / 접속의 통제 불가", bias_axis_pref: { Exposure: "LOW", Separation: "SEPARATED" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY" }, display_tags: ["control", "privacy"] },
    { id: "DC1-02", label: "고립 / 사회적 접점 부족", bias_axis_pref: { Exposure: "HIGH", Sharing: "MANDATORY" }, anti_axis_forbid: { Encounter: "AVOID" }, display_tags: ["encounter", "community"] },
    { id: "DC1-03", label: "우연의 과잉 / 마주침 과부하", bias_axis_pref: { Exposure: "LOW", Encounter: "AVOID", Separation: "BUFFERED" }, anti_axis_forbid: { Encounter: "FORCED", Centrality: "CENTRALIZED" }, display_tags: ["buffer", "privacy"] },
    { id: "DC1-04", label: "사생활 침해 / 시선 노출", bias_axis_pref: { Exposure: "LOW", Access: "RESTRICTED", Expression: "SILENT" }, anti_axis_forbid: { Exposure: "HIGH", Expression: "EXPRESSIVE" }, display_tags: ["privacy", "protection"] },
    { id: "DC1-05", label: "공유의 강요 / 선택권 결여", bias_axis_pref: { Separation: "BUFFERED", Centrality: "LINEAR" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY" }, display_tags: ["optional", "user-initiated"] },
    { id: "DC1-06", label: "프로그램 충돌 / 동시 사용 간섭", bias_axis_pref: { Temporal: "SCHEDULED", Separation: "SEPARATED" }, anti_axis_forbid: { Sharing: "MANDATORY", Centrality: "CENTRALIZED" }, display_tags: ["time-based", "separation"] },
    { id: "DC1-07", label: "운영 지속 가능성 / 관리 부담", bias_axis_pref: { Temporal: "SCHEDULED" }, anti_axis_forbid: { Temporal: "EVENT" }, display_tags: ["robust", "simplified"] },
    { id: "DC1-08", label: "경제성 / 면적 효율", bias_axis_pref: { Exposure: "HIGH", Encounter: "FORCED", Access: "OPEN", Sharing: "MANDATORY", Centrality: "CENTRALIZED", Mass: "MONO", Expression: "EXPRESSIVE" }, anti_axis_forbid: { Separation: "BUFFERED", Mass: "FRAGMENTED" }, display_tags: ["efficiency", "centralized"] },
    { id: "DC1-09", label: "환경 성능 / 소음·채광·환기", bias_axis_pref: { Exposure: "LOW", Separation: "BUFFERED" }, anti_axis_forbid: { Exposure: "LOW", Expression: "SILENT" }, display_tags: ["environment", "courtyard"] },
    { id: "DC1-10", label: "도시 맥락 / 공공성과 사적 경계", bias_axis_pref: { Access: "OPEN", Separation: "BUFFERED", Centrality: "LINEAR" }, anti_axis_forbid: { Exposure: "LOW", Access: "RESTRICTED" }, display_tags: ["public-private", "threshold"] },
    { id: "DC1-11", label: "안전 / 접근 통제", bias_axis_pref: { Exposure: "LOW", Access: "RESTRICTED", Separation: "BUFFERED" }, anti_axis_forbid: { Exposure: "HIGH", Access: "OPEN" }, display_tags: ["controlled-access", "protected"] },
    { id: "DC1-12", label: "정체성 전환 / 삶의 단계 변화 지원", bias_axis_pref: { Temporal: "EVENT" }, anti_axis_forbid: {}, display_tags: ["flexible", "adaptive"] },
    { id: "DC1-13", label: "정신적 회복 / 휴식과 보호", bias_axis_pref: { Exposure: "LOW", Encounter: "AVOID", Expression: "SILENT" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY", Expression: "EXPRESSIVE" }, display_tags: ["protected", "quiet-access"] },
    { id: "DC1-14", label: "활동 촉진 / 에너지와 사회성", bias_axis_pref: { Exposure: "HIGH", Encounter: "FORCED", Sharing: "MANDATORY", Centrality: "CENTRALIZED" }, anti_axis_forbid: { Encounter: "AVOID" }, display_tags: ["exposure", "shared-attractor"] },
    { id: "DC1-15", label: "개인 작업/학습 지원", bias_axis_pref: { Exposure: "LOW", Temporal: "SCHEDULED", Separation: "BUFFERED" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY" }, display_tags: ["quiet-zoning", "scheduled"] },
    { id: "DC1-16", label: "프라이버시-공유의 균형 조절", bias_axis_pref: { Separation: "BUFFERED" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY", Separation: "SEPARATED" }, display_tags: ["gradient", "selective-connection"] },
    { id: "DC1-17", label: "사용자 다양성 / 서로 다른 생활리듬 공존", bias_axis_pref: { Temporal: "SCHEDULED", Separation: "BUFFERED" }, anti_axis_forbid: { Centrality: "CENTRALIZED" }, display_tags: ["time-based", "parallel"] },
    { id: "DC1-18", label: "커뮤니티의 질 / 얕은 관계의 피로", bias_axis_pref: { Separation: "BUFFERED", Centrality: "LINEAR" }, anti_axis_forbid: { Encounter: "FORCED", Sharing: "MANDATORY" }, display_tags: ["low-intensity", "buffer"] },
    { id: "DC1-19", label: "가시성의 조절 / 보이고-안보이고", bias_axis_pref: { Access: "RESTRICTED" }, anti_axis_forbid: { Exposure: "LOW", Expression: "SILENT" }, display_tags: ["filtered", "visual-only"] },
    { id: "DC1-20", label: "메시지/상징성 / 사회적 발언", bias_axis_pref: { Expression: "EXPRESSIVE" }, anti_axis_forbid: { Exposure: "LOW", Expression: "SILENT" }, display_tags: ["statement", "external-legibility"] }
  ],
  
  dc2_types: [
    { type: "DC2.A", label: "ON/OFF 이분 구조 (Binary Control)", engine_axes: { Exposure: "LOW", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "SEPARATED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["on_off", "control"] },
    { type: "DC2.B", label: "연속적 스펙트럼 (Gradient Control)", engine_axes: { Exposure: "MID", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "EVENT", Separation: "BUFFERED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["gradient", "buffer"] },
    { type: "DC2.C", label: "완충 중심 구조 (Buffer-mediated)", engine_axes: { Exposure: "LOW", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "BUFFERED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["buffer", "mediating"] },
    { type: "DC2.D", label: "보호 우선 구조 (Protection-first)", engine_axes: { Exposure: "LOW", Encounter: "AVOID", Access: "RESTRICTED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "INTEGRATED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "SILENT" }, display_tags: ["privacy", "protection"] },
    { type: "DC2.E", label: "노출 우선 구조 (Exposure-first)", engine_axes: { Exposure: "HIGH", Encounter: "OPTIONAL", Access: "OPEN", Sharing: "MANDATORY", Temporal: "STATIC", Separation: "INTEGRATED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["exposure", "community"] }
  ],

  dc5_types: [
    { type: "DC5.A", label: "이중 동선 (Dual-layer Circulation)", engine_axes: { Exposure: "LOW", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "BUFFERED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["dual-layer", "privacy"] },
    { type: "DC5.B", label: "단일 경로 (Single-path Circulation)", engine_axes: { Exposure: "HIGH", Encounter: "FORCED", Access: "OPEN", Sharing: "MANDATORY", Temporal: "STATIC", Separation: "INTEGRATED", Centrality: "CENTRALIZED", Mass: "MONO", Expression: "EXPRESSIVE" }, display_tags: ["single-path", "mandatory"] },
    { type: "DC5.C", label: "선택적 우회 (Optional Detour)", engine_axes: { Exposure: "MID", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "INTEGRATED", Centrality: "LINEAR", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["optional", "detour"] },
    { type: "DC5.D", label: "루프/회귀 (Loop / Return)", engine_axes: { Exposure: "MID", Encounter: "OPTIONAL", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "BUFFERED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["loop", "sequence"] },
    { type: "DC5.E", label: "비마주침/직통 (Skip-access / Non-encounter)", engine_axes: { Exposure: "LOW", Encounter: "AVOID", Access: "CONTROLLED", Sharing: "OPTIONAL", Temporal: "STATIC", Separation: "INTEGRATED", Centrality: "DISTRIBUTED", Mass: "CLUSTERED", Expression: "FILTERED" }, display_tags: ["non-encounter", "protected"] }
  ],

  dc3_options: [
    { id: "DC3-01", label: "Terminal Program (목적지형 공유)", engine_axes: { Exposure: "MID", Centrality: "LINEAR" }, display_tags: ["terminal"] },
    { id: "DC3-02", label: "Mandatory Passage Program (필수 경유 공유)", engine_axes: { Encounter: "FORCED", Sharing: "MANDATORY" }, display_tags: ["mandatory"] },
    { id: "DC3-03", label: "User-Initiated Program (사용자 호출형)", engine_axes: { Sharing: "OPTIONAL", Access: "CONTROLLED" }, display_tags: ["user-initiated"] },
    { id: "DC3-04", label: "Always-On Program (상시 작동 공유)", engine_axes: { Sharing: "MANDATORY", Temporal: "STATIC" }, display_tags: ["always-on"] },
    { id: "DC3-05", label: "Skip-Accessible Program (비경유 접근 공유)", engine_axes: { Encounter: "AVOID" }, display_tags: ["skip-access"] },
    { id: "DC3-06", label: "Time-Separated Program (시간 분리 운영)", engine_axes: { Temporal: "SCHEDULED" }, display_tags: ["time-based"] },
    { id: "DC3-07", label: "Scheduled Program (예약/스케줄 운영)", engine_axes: { Temporal: "SCHEDULED" }, display_tags: ["scheduled"] },
    { id: "DC3-08", label: "Event-Based Program (이벤트성 운영)", engine_axes: { Temporal: "EVENT" }, display_tags: ["event-based"] },
    { id: "DC3-10", label: "Low-Intensity Shared (저강도 공유)", engine_axes: { Separation: "BUFFERED" }, display_tags: ["low-intensity"] },
    { id: "DC3-13", label: "Private-Adjacent (사적 인접 완충)", engine_axes: { Separation: "BUFFERED" }, display_tags: ["buffer"] },
    { id: "DC3-15", label: "Central Shared (중심부 공유)", engine_axes: { Centrality: "CENTRALIZED", Encounter: "FORCED" }, display_tags: ["centralized"] },
    { id: "DC3-16", label: "Vertical-Isolated Shared (수직 분리 공유)", engine_axes: { Separation: "SEPARATED", Mass: "STACKED" }, display_tags: ["vertical"] },
    { id: "DC3-22", label: "Parallel Programs (병렬 프로그램)", engine_axes: { Centrality: "DISTRIBUTED" }, display_tags: ["parallel"] },
    { id: "DC3-24", label: "Buffer Programs (완충 프로그램)", engine_axes: { Separation: "BUFFERED" }, display_tags: ["buffer"] }
  ],

  dc4_options: [
    { id: "DC4-01", label: "Monolithic Mass (단일체)", engine_axes: { Mass: "MONO", Centrality: "CENTRALIZED" }, display_tags: ["monolithic"] },
    { id: "DC4-02", label: "Clustered Mass (군집 분절)", engine_axes: { Mass: "CLUSTERED", Centrality: "DISTRIBUTED" }, display_tags: ["clustered"] },
    { id: "DC4-05", label: "Linear Bar (선형 바)", engine_axes: { Mass: "MONO", Centrality: "LINEAR" }, display_tags: ["linear"] },
    { id: "DC4-06", label: "Strong Central Core (강한 중심 코어)", engine_axes: { Centrality: "CENTRALIZED" }, display_tags: ["core-dominant"] },
    { id: "DC4-08", label: "Non-Centralized Field (비중심 필드)", engine_axes: { Centrality: "DISTRIBUTED" }, display_tags: ["distributed"] },
    { id: "DC4-12", label: "Courtyard-Based (중정 기반)", engine_axes: { Separation: "BUFFERED" }, display_tags: ["courtyard"] },
    { id: "DC4-14", label: "Central Placement (중앙 배치)", engine_axes: { Centrality: "CENTRALIZED" }, display_tags: ["centralized"] },
    { id: "DC4-19", label: "Single Access Mass (단일 접근)", engine_axes: { Encounter: "FORCED" }, display_tags: ["single-access"] },
    { id: "DC4-21", label: "Separated Access Blocks (분리 접근 블록)", engine_axes: { Encounter: "AVOID", Separation: "SEPARATED" }, display_tags: ["separated"] }
  ],
  
  dc6_options: [
    { id: "DC6-01", label: "Integrated Structural System (일체형 구조)", engine_axes: { Centrality: "CENTRALIZED" }, display_tags: ["integrated"] },
    { id: "DC6-02", label: "Structure-Independent Space (구조-공간 독립)", engine_axes: { Temporal: "EVENT" }, display_tags: ["flexible"] },
    { id: "DC6-08", label: "Service-Core Dominant (서비스 코어 지배)", engine_axes: { Centrality: "CENTRALIZED" }, display_tags: ["service-core"] },
    { id: "DC6-09", label: "Distributed Structural Supports (분산 지지)", engine_axes: { Centrality: "DISTRIBUTED" }, display_tags: ["distributed"] }
  ],
  
  dc7_options: [
    { id: "DC7-01", label: "Opaque / Silent Expression (불투명/침묵)", engine_axes: { Exposure: "LOW", Expression: "SILENT" }, display_tags: ["opaque"] },
    { id: "DC7-02", label: "Transparent / Expressive (투명/표현)", engine_axes: { Exposure: "HIGH", Expression: "EXPRESSIVE" }, display_tags: ["transparent"] },
    { id: "DC7-03", label: "Semi-Transparent Filtering (반투명 필터)", engine_axes: { Expression: "FILTERED", Separation: "BUFFERED" }, display_tags: ["filtered"] },
    { id: "DC7-04", label: "Contrast-Based Expression (대비 기반)", engine_axes: { Expression: "EXPRESSIVE" }, display_tags: ["contrast"] },
    { id: "DC7-05", label: "Unified Architectural Language (통합 언어)", engine_axes: { Expression: "FILTERED" }, display_tags: ["unified"] }
  ]
};

export const LOGIC_RULES = {
  execution_spec: {
    weak_match_pairs: [
      { axis: "Exposure", pairs: [["LOW", "MID"], ["HIGH", "MID"]] },
      { axis: "Encounter", pairs: [["AVOID", "OPTIONAL"], ["FORCED", "OPTIONAL"]] },
      { axis: "Separation", pairs: [["SEPARATED", "BUFFERED"], ["INTEGRATED", "BUFFERED"]] },
      { axis: "Expression", pairs: [["SILENT", "FILTERED"], ["EXPRESSIVE", "FILTERED"]] }
    ]
  },
  exclusion_rules: {
    dc2_rules: [
      {
        id: "R-DC2A",
        when: "DC2.A",
        rationale: "Binary ON/OFF requires optional connection; mandatory/always-on breaks OFF state.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }, { Temporal: "STATIC", Sharing: "MANDATORY" }],
          dc7: [{ Expression: "FILTERED" }] // Assuming 'unified' often maps to FILTERED/Continuous in this simplified set
        },
        exclude_soft_axis_patterns: {
          dc7: [{ Exposure: "HIGH", Expression: "EXPRESSIVE" }]
        }
      },
      {
        id: "R-DC2B",
        when: "DC2.B",
        rationale: "Gradient logic conflicts with destination-style terminal logic.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "OPTIONAL", Centrality: "LINEAR" }], // Terminal often linear/end
          dc7: [{ Expression: "EXPRESSIVE" }] // Contrast matches expressive
        },
        exclude_soft_axis_patterns: {
          dc5: [{ Encounter: "AVOID" }] // DC5.E skip access
        }
      },
      {
        id: "R-DC2C",
        when: "DC2.C",
        rationale: "Buffer-mediated design needs intermediate state.",
        exclude_hard_axis_patterns: {
          dc3: [{ Temporal: "STATIC", Sharing: "MANDATORY" }] // Always on
        },
        exclude_soft_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }],
          dc7: [{ Exposure: "LOW", Expression: "SILENT" }] // Opaque
        }
      },
      {
        id: "R-DC2D",
        when: "DC2.D",
        rationale: "Protection-first cannot tolerate forced encounter.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }],
          dc7: [{ Exposure: "HIGH", Expression: "EXPRESSIVE" }]
        },
        exclude_soft_axis_patterns: {
          dc4: [{ Centrality: "CENTRALIZED" }]
        }
      },
      {
        id: "R-DC2E",
        when: "DC2.E",
        rationale: "Exposure-first conflicts with user-initiated only access.",
        exclude_hard_axis_patterns: {
          dc3: [{ Access: "CONTROLLED", Sharing: "OPTIONAL" }], // User initiated usually controlled
          dc7: [{ Exposure: "LOW", Expression: "SILENT" }]
        },
        exclude_soft_axis_patterns: {
          dc3: [{ Sharing: "OPTIONAL", Centrality: "LINEAR" }]
        }
      }
    ],
    dc5_rules: [
      {
        id: "R-DC5A",
        when: "DC5.A",
        rationale: "Dual-layer circulation needs parallel organization.",
        exclude_hard_axis_patterns: {
          dc4: [{ Mass: "MONO" }, { Centrality: "CENTRALIZED" }],
          dc6: [{ Centrality: "CENTRALIZED" }]
        },
        exclude_soft_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }]
        }
      },
      {
        id: "R-DC5B",
        when: "DC5.B",
        rationale: "Single-path tends to create mandatory encounter.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "OPTIONAL", Centrality: "LINEAR" }]
        },
        exclude_soft_axis_patterns: {}
      },
      {
        id: "R-DC5C",
        when: "DC5.C",
        rationale: "Optional detour requires a safe baseline route.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }],
          dc4: [{ Centrality: "CENTRALIZED" }]
        },
        exclude_soft_axis_patterns: {
          dc7: [{ Expression: "FILTERED" }]
        }
      },
      {
        id: "R-DC5D",
        when: "DC5.D",
        rationale: "Loop circulation conflicts with linear terminal logic.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "OPTIONAL", Centrality: "LINEAR" }],
          dc4: [{ Centrality: "LINEAR", Mass: "MONO" }]
        },
        exclude_soft_axis_patterns: {}
      },
      {
        id: "R-DC5E",
        when: "DC5.E",
        rationale: "Non-encounter circulation cannot coexist with forced encounter.",
        exclude_hard_axis_patterns: {
          dc3: [{ Sharing: "MANDATORY", Encounter: "FORCED" }],
          dc4: [{ Centrality: "CENTRALIZED" }],
          dc7: [{ Exposure: "HIGH", Expression: "EXPRESSIVE" }]
        },
        exclude_soft_axis_patterns: {
          dc3: [{ Separation: "BUFFERED" }]
        }
      }
    ],
    combo_rules: [
      { when: { dc2: "DC2.A", dc5: "DC5.B" }, conflict_level: "HARD", target_dc5: "DC5.B", reason: "ON/OFF 통제를 위해선 회피 경로가 필요합니다." },
      { when: { dc2: "DC2.D", dc5: "DC5.B" }, conflict_level: "HARD", target_dc5: "DC5.B", reason: "보호 우선 구조에서 단일 경로는 강제 노출을 유발합니다." },
      { when: { dc2: "DC2.E", dc5: "DC5.E" }, conflict_level: "HARD", target_dc5: "DC5.E", reason: "노출 우선 구조와 비마주침 동선은 모순됩니다." }
    ]
  }
};
