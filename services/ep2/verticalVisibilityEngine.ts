// EP2-4 Vertical Visibility Engine

export interface VisibilityModifier {
  type: 'VERTICAL_VISIBILITY';
  void_id: string;
  from_space_id: string;
  to_space_id: string;
  delta_V_vertical: number;
  meta: { floor_from: number; floor_to: number; floor_gap: number; factor: number; base: number; multiplier: number; weight: number; cap: number };
}

export interface VerticalVisibilityResult {
  relation_modifiers: VisibilityModifier[];
  warnings: Array<{ void_id: string; code: string; message: string }>;
}

function roundScore(v: number, precision = 0.01): number {
  const inv = 1 / precision;
  return Math.round(v * inv) / inv;
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

function pickFactorByFloorGap(distanceTable: Array<{ floor_gap: number; factor: number }>, gap: number): number {
  if (gap <= 0) return 0.0;
  for (const row of distanceTable) {
    if (row.floor_gap === gap) return row.factor;
  }
  const sorted = [...distanceTable].sort((a, b) => a.floor_gap - b.floor_gap);
  return sorted.length ? sorted[sorted.length - 1].factor : 0.5;
}

function computePatternMultiplier(selectedPatterns: string[], rules: any): number {
  let mult = 1.0;
  for (const r of (rules?.pattern_visibility_adjustments || [])) {
    const pats: string[] = r.if_any_patterns || [];
    if (pats.some((p) => selectedPatterns.includes(p))) {
      const m = r?.apply?.multiplier;
      if (typeof m === 'number') mult *= m;
    }
  }
  return mult;
}

export function runVerticalVisibilityEngine(params: {
  ep1: any;
  voidNodes: any[];
  visibilityRules: Record<string, any>;
  selectedPatterns?: string[];
}): VerticalVisibilityResult {
  const { ep1, voidNodes, visibilityRules, selectedPatterns = [] } = params;
  const modifiers: VisibilityModifier[] = [];
  const warnings: VerticalVisibilityResult['warnings'] = [];

  const scorePrecision = visibilityRules?.global_policy?.rounding?.score_precision ?? 0.01;
  const defaultWeight = visibilityRules?.global_policy?.default_vertical_weight ?? 1.0;
  const maxPairsPerVoid = visibilityRules?.global_policy?.max_pairs_per_void ?? 200;
  const distanceTable = visibilityRules?.distance_by_floor_gap || [];

  const spaceMap = buildSpaceMap(ep1);
  const patternMult = computePatternMultiplier(selectedPatterns, visibilityRules);

  for (const v of (voidNodes || [])) {
    const voidId = v?.void_id || 'VOID-UNKNOWN';
    const voidType = v?.void_type || 'UNKNOWN';
    const defaults = visibilityRules?.void_type_visibility_defaults?.[voidType];

    if (!defaults) {
      warnings.push({ void_id: voidId, code: 'MISSING_VIS_DEFAULT', message: `No visibility defaults for void_type=${voidType}` });
      continue;
    }

    const anchorIds: string[] = (v?.anchors?.anchor_spaces || []).filter((id: string) => spaceMap.has(id));
    const candidates: Array<{ id: string; floor: number }> = [];

    for (const id of anchorIds) {
      const sp = spaceMap.get(id);
      const fl = getSpaceFloor(sp);
      if (typeof fl !== 'number') {
        warnings.push({ void_id: voidId, code: 'MISSING_SPACE_FLOOR', message: `Space ${id} has no floor info.` });
        continue;
      }
      candidates.push({ id, floor: fl });
    }

    let pairCount = 0;
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        if (pairCount >= maxPairsPerVoid) break;
        const a = candidates[i], b = candidates[j];
        const gap = Math.abs(a.floor - b.floor);
        if (gap === 0) continue;

        const nodeVV = v?.effects?.vertical_visibility || {};
        if (nodeVV.enabled === false) continue;

        const factor = pickFactorByFloorGap(distanceTable, gap);
        const nodeMult = typeof nodeVV.multiplier === 'number' ? nodeVV.multiplier : 1.0;
        const weight = typeof nodeVV.weight === 'number' ? nodeVV.weight : defaultWeight;
        const totalMult = defaults.multiplier * patternMult * nodeMult;
        const vv = Math.min(defaults.base * totalMult * factor * weight, defaults.cap);

        modifiers.push({
          type: 'VERTICAL_VISIBILITY',
          void_id: voidId,
          from_space_id: a.id,
          to_space_id: b.id,
          delta_V_vertical: roundScore(vv, scorePrecision),
          meta: {
            floor_from: a.floor, floor_to: b.floor, floor_gap: gap,
            factor: roundScore(factor, scorePrecision),
            base: roundScore(defaults.base, scorePrecision),
            multiplier: roundScore(totalMult, scorePrecision),
            weight: roundScore(weight, scorePrecision),
            cap: roundScore(defaults.cap, scorePrecision),
          },
        });
        pairCount++;
      }
      if (pairCount >= maxPairsPerVoid) break;
    }
  }

  return { relation_modifiers: modifiers, warnings };
}
