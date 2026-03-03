// EP2-5 Adjacency Modifier Engine

export interface AdjacencyModifier {
  type: 'ADJACENCY_MODIFIER';
  void_id: string;
  from_space_id: string;
  to_space_id: string;
  delta_A: number;
  delta_R: number;
  meta: { floor_from: number; floor_to: number; floor_gap: number; factor: number; base_delta_A: number; pattern_multiplier: number; cap_abs: number; scope_mode: string; radius_hops: number; note: string };
}

export interface AdjacencyModifierResult {
  relation_modifiers: AdjacencyModifier[];
  warnings: Array<{ void_id: string; code: string; message: string }>;
}

function roundScore(v: number, precision = 0.01): number {
  const inv = 1 / precision;
  return Math.round(v * inv) / inv;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getSpaceFloor(space: any): number | null {
  const preferred = space?.placement?.floor_preference?.preferred;
  if (Array.isArray(preferred) && preferred.length > 0) return preferred[0];
  const fromFloor = space?.placement?.span?.from_floor;
  if (typeof fromFloor === 'number') return fromFloor;
  return space?.floor ?? space?.assigned_floor ?? space?.floor_index ?? null;
}

function buildSpaceMap(ep1: any): Map<string, any> {
  const map = new Map<string, any>();
  for (const s of (ep1?.spaces || [])) {
    const id = s?.space_id ?? s?.id;
    if (id) map.set(id, s);
  }
  return map;
}

function pickFactorByGap(table: Array<{ gap: number; factor: number }>, gap: number, fallback: number): number {
  if (gap <= 0) return 0.0;
  for (const row of (table || [])) {
    if (row.gap === gap) return row.factor;
  }
  return typeof fallback === 'number' ? fallback : 0.45;
}

function computePatternMultiplier(selectedPatterns: string[], dirRules: any): number {
  let mult = 1.0;
  const invert: string[] = dirRules?.patterns_invert_to_buffer || [];
  if (invert.some((p) => selectedPatterns.includes(p))) {
    return mult * (typeof dirRules?.invert_multiplier === 'number' ? dirRules.invert_multiplier : -0.4);
  }
  const reduce: string[] = dirRules?.patterns_reduce_adjacency || [];
  if (reduce.some((p) => selectedPatterns.includes(p))) {
    mult *= (typeof dirRules?.reduce_multiplier === 'number' ? dirRules.reduce_multiplier : 0.6);
  }
  const boost: string[] = dirRules?.patterns_boost_adjacency || [];
  if (boost.some((p) => selectedPatterns.includes(p))) {
    mult *= (typeof dirRules?.boost_multiplier === 'number' ? dirRules.boost_multiplier : 1.15);
  }
  return mult;
}

function expandByGraphNeighbors(anchorIds: string[], ep1: any, radiusHops: number): string[] {
  const ids = new Set(anchorIds);
  if (!radiusHops || radiusHops <= 0) return Array.from(ids);
  const edges: any[] = ep1?.relations?.graph?.edges || ep1?.relations?.edges || [];
  if (!edges.length) return Array.from(ids);

  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const a = e?.from ?? e?.from_space_id ?? e?.source;
    const b = e?.to ?? e?.to_space_id ?? e?.target;
    if (!a || !b) continue;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }

  let frontier = new Set(anchorIds);
  for (let hop = 0; hop < radiusHops; hop++) {
    const next = new Set<string>();
    for (const id of frontier) {
      for (const n of (adj.get(id) || [])) {
        if (!ids.has(n)) { ids.add(n); next.add(n); }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return Array.from(ids);
}

function getScopeForVoid(voidNode: any, rules: any) {
  const vt = voidNode?.void_type;
  const byType = rules?.scope_rules?.by_void_type?.[vt];
  const def = rules?.scope_rules?.default || { mode: 'ANCHOR_ONLY', radius_hops: 0 };
  let mode = byType?.mode ?? def.mode;
  let radius = byType?.radius_hops ?? def.radius_hops;
  const override = voidNode?.effects?.adjacency_modifier;
  if (override) {
    if (typeof override.scope === 'string') mode = override.scope;
    if (typeof override.radius_hops === 'number') radius = override.radius_hops;
  }
  return { mode, radius_hops: radius };
}

export function runAdjacencyModifierEngine(params: {
  ep1: any;
  voidNodes: any[];
  adjacencyRules: Record<string, any>;
  selectedPatterns?: string[];
}): AdjacencyModifierResult {
  const { ep1, voidNodes, adjacencyRules, selectedPatterns = [] } = params;
  const relation_modifiers: AdjacencyModifier[] = [];
  const warnings: AdjacencyModifierResult['warnings'] = [];

  const spaceMap = buildSpaceMap(ep1);
  const policy = adjacencyRules?.global_policy || {};
  const scorePrecision = policy?.rounding?.score_precision ?? 0.01;
  const maxPairsPerVoid = policy?.max_pairs_per_void ?? 250;
  const gapTable = policy?.floor_gap_factor?.table || [];
  const gapFallback = policy?.floor_gap_factor?.fallback_factor_for_large_gap ?? 0.45;
  const clampMin = policy?.clamps?.delta_A_min ?? -3.0;
  const clampMax = policy?.clamps?.delta_A_max ?? 3.0;
  const patternMultiplier = computePatternMultiplier(selectedPatterns, adjacencyRules?.directional_rules || {});

  for (const v of (voidNodes || [])) {
    const voidId = v?.void_id || 'VOID-UNKNOWN';
    const voidType = v?.void_type || 'UNKNOWN';
    const vtDefaults = adjacencyRules?.void_type_adjacency_defaults?.[voidType];

    if (!vtDefaults) {
      warnings.push({ void_id: voidId, code: 'MISSING_ADJ_DEFAULT', message: `No adjacency defaults for void_type=${voidType}` });
      continue;
    }

    const anchors: string[] = v?.anchors?.anchor_spaces || [];
    if (!anchors.length) {
      warnings.push({ void_id: voidId, code: 'MISSING_ANCHORS', message: `Void ${voidId} has no anchor_spaces` });
      continue;
    }

    const scope = getScopeForVoid(v, adjacencyRules);
    let candidateIds = Array.from(new Set(anchors));
    if (scope.mode !== 'ANCHOR_ONLY' && scope.radius_hops > 0) {
      candidateIds = expandByGraphNeighbors(candidateIds, ep1, scope.radius_hops);
    }

    const candidates: Array<{ id: string; floor: number }> = [];
    for (const id of candidateIds) {
      const sp = spaceMap.get(id);
      if (!sp) continue;
      const fl = getSpaceFloor(sp);
      if (typeof fl !== 'number') {
        warnings.push({ void_id: voidId, code: 'MISSING_SPACE_FLOOR', message: `Space ${id} has no floor info` });
        continue;
      }
      candidates.push({ id, floor: fl });
    }

    const spanStart = v?.span?.start_floor;
    const spanEnd = v?.span?.end_floor;
    const inSpan = (f: number) =>
      !policy.apply_only_across_span_floors ||
      (typeof spanStart === 'number' && typeof spanEnd === 'number' && f >= spanStart && f <= spanEnd);

    let pairCount = 0;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (pairCount >= maxPairsPerVoid) break;
        const a = candidates[i], b = candidates[j];
        if (policy.allow_same_floor_pairs === false && a.floor === b.floor) continue;
        if (!inSpan(a.floor) || !inSpan(b.floor)) continue;

        const gap = Math.abs(a.floor - b.floor);
        if (gap <= 0) continue;

        const nodeAdj = v?.effects?.adjacency_modifier || {};
        if (nodeAdj.enabled === false) continue;

        const factor = pickFactorByGap(gapTable, gap, gapFallback);
        let baseDeltaA = vtDefaults.base_delta_A;
        if (typeof nodeAdj.delta_A === 'number') baseDeltaA = nodeAdj.delta_A;

        let deltaA = baseDeltaA * factor * patternMultiplier;
        deltaA = clamp(deltaA, -(vtDefaults.cap_abs ?? 2.0), vtDefaults.cap_abs ?? 2.0);
        deltaA = clamp(deltaA, clampMin, clampMax);
        deltaA = roundScore(deltaA, scorePrecision);

        relation_modifiers.push({
          type: 'ADJACENCY_MODIFIER',
          void_id: voidId,
          from_space_id: a.id,
          to_space_id: b.id,
          delta_A: deltaA,
          delta_R: deltaA,
          meta: {
            floor_from: a.floor, floor_to: b.floor, floor_gap: gap,
            factor: roundScore(factor, scorePrecision),
            base_delta_A: roundScore(baseDeltaA, scorePrecision),
            pattern_multiplier: roundScore(patternMultiplier, scorePrecision),
            cap_abs: vtDefaults.cap_abs ?? 2.0,
            scope_mode: scope.mode,
            radius_hops: scope.radius_hops,
            note: `VoidType=${voidType}; scope=${scope.mode}`,
          },
        });
        pairCount++;
      }
      if (pairCount >= maxPairsPerVoid) break;
    }
  }

  return { relation_modifiers, warnings };
}
