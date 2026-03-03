// EP2-3 Footprint Deduction Engine

export interface BuildingInfo {
  floors_total: number;
  ground_floor_index?: number;
  floor_plates: {
    mode: 'ONE_PLATE' | 'PER_FLOOR';
    default_plate_area_m2?: number;
    per_floor_plate_area_m2?: Record<string, number>;
  };
}

export interface VoidNode {
  void_id: string;
  void_type: string;
  span: { start_floor: number; end_floor: number };
  footprint?: { mode: string; value: number; counts_as_gfa?: boolean; per_floor_override?: Array<{ floor: number; mode: string; value: number }> };
  anchors?: { anchor_spaces?: string[] };
}

export interface FootprintAdjustment {
  floor: number;
  void_id: string;
  void_type: string;
  plate_area_m2: number;
  deduct_area_m2: number;
  remaining_usable_m2: number;
  deduct_mode: string;
  effective_value: number;
  counts_as_gfa: boolean;
  clamps_applied: { max_deduct_ratio: boolean; min_remaining_ratio: boolean };
  debug: { raw_deduct_area_m2: number; raw_deduct_ratio: number; pattern_multiplier: number; floor_multiplier: number; previous_usable_m2: number };
}

export interface FootprintEngineResult {
  footprint_adjustments: FootprintAdjustment[];
  warnings: Array<{ void_id: string | null; floor: number | null; code: string; message: string }>;
  usable_area_by_floor: Record<number, number | null>;
}

function roundTo(value: number, precision = 0.1): number {
  const inv = 1 / precision;
  return Math.round(value * inv) / inv;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasAnyPattern(selectedPatterns: string[], ifAnyPatterns: string[]): boolean {
  const set = new Set(selectedPatterns || []);
  return (ifAnyPatterns || []).some((p) => set.has(p));
}

function getPlateAreaM2(building: BuildingInfo, floor: number): number | null {
  const fp = building?.floor_plates;
  if (!fp) return null;
  if (fp.mode === 'PER_FLOOR' && fp.per_floor_plate_area_m2) {
    const v = fp.per_floor_plate_area_m2[String(floor)] ?? fp.per_floor_plate_area_m2[floor];
    if (typeof v === 'number' && v > 0) return v;
  }
  if (typeof fp.default_plate_area_m2 === 'number' && fp.default_plate_area_m2 > 0) {
    return fp.default_plate_area_m2;
  }
  return null;
}

function getFloorPosition(building: BuildingInfo, floor: number) {
  const ground = building?.ground_floor_index ?? 1;
  const top = building?.floors_total ?? null;
  if (top == null) return { isGround: floor === ground, isTop: false };
  return { isGround: floor === ground, isTop: floor === top };
}

function getEffectiveFootprintSpec(voidNode: VoidNode, selectedPatterns: string[], footprintRules: Record<string, any>) {
  const defaults = footprintRules?.void_type_default_footprint || {};
  const voidType = voidNode?.void_type;
  const base = voidNode?.footprint ?? defaults[voidType];
  if (!base) {
    return { mode: 'RATIO', value: 0.05, counts_as_gfa: false, per_floor_override: [], _debug: { ratioMultiplier: 1.0, source: 'FALLBACK_DEFAULT' } };
  }
  let ratioMultiplier = 1.0;
  const patternAdjustments = footprintRules?.pattern_footprint_adjustments || [];
  for (const rule of patternAdjustments) {
    if (hasAnyPattern(selectedPatterns, rule.if_any_patterns)) {
      const mult = rule?.apply?.ratio_multiplier;
      if (typeof mult === 'number') ratioMultiplier *= mult;
    }
  }
  return {
    mode: base.mode,
    value: base.value,
    counts_as_gfa: typeof base.counts_as_gfa === 'boolean'
      ? base.counts_as_gfa
      : (footprintRules?.global_policy?.counts_as_gfa_policy?.default_counts_as_gfa ?? false),
    per_floor_override: base.per_floor_override || [],
    _debug: { ratioMultiplier, source: voidNode?.footprint ? 'VOIDNODE' : 'TYPE_DEFAULT' },
  };
}

function getPerFloorOverride(footprintSpec: any, floor: number) {
  for (const o of (footprintSpec?.per_floor_override || [])) {
    if (o && o.floor === floor) return { mode: o.mode, value: o.value };
  }
  return null;
}

function sumAnchorAreasM2(ep1: any, anchorSpaceIds: string[]): number {
  const spaces = ep1?.spaces || [];
  const set = new Set(anchorSpaceIds || []);
  let sum = 0;
  for (const sp of spaces) {
    const spId = sp?.space_id ?? sp?.id;
    if (!spId || !set.has(spId)) continue;
    const a = sp.area?.total_m2
      ?? (sp.area?.each_m2 != null ? sp.area.each_m2 * (sp.quantity ?? 1) : null)
      ?? sp.allocated_area_m2
      ?? sp.allocated_area;
    if (typeof a === 'number' && a > 0) sum += a;
  }
  return sum;
}

function applyFloorLevelMultiplier(baseRatio: number, building: BuildingInfo, floor: number, footprintRules: any) {
  const mods = footprintRules?.floor_level_modifiers || [];
  const { isGround, isTop } = getFloorPosition(building, floor);
  let mult = 1.0;
  for (const m of mods) {
    if (m.when_floor_is === 'GROUND_ONLY' && isGround && typeof m?.apply?.ratio_multiplier === 'number') mult *= m.apply.ratio_multiplier;
    if (m.when_floor_is === 'TOP_ONLY' && isTop && typeof m?.apply?.ratio_multiplier === 'number') mult *= m.apply.ratio_multiplier;
  }
  return { ratio: baseRatio * mult, floorMultiplier: mult };
}

export function runFootprintDeductionEngine(params: {
  ep1: any;
  building: BuildingInfo;
  voidNodes: VoidNode[];
  footprintRules: Record<string, any>;
  selectedPatterns?: string[];
}): FootprintEngineResult {
  const { ep1, building, voidNodes, footprintRules, selectedPatterns = [] } = params;
  const warnings: FootprintEngineResult['warnings'] = [];
  const footprint_adjustments: FootprintAdjustment[] = [];

  const floorsTotal = building?.floors_total;
  if (typeof floorsTotal !== 'number' || floorsTotal < 1) throw new Error('building.floors_total must be a number >= 1');

  const usable_area_by_floor: Record<number, number | null> = {};
  for (let f = 1; f <= floorsTotal; f++) {
    const plate = getPlateAreaM2(building, f);
    if (plate == null) { warnings.push({ void_id: null, floor: f, code: 'MISSING_PLATE_AREA', message: `Missing plate area for floor ${f}.` }); usable_area_by_floor[f] = null; }
    else usable_area_by_floor[f] = plate;
  }

  const policy = footprintRules?.global_policy || {};
  const maxDeductRatio = policy.max_deduct_ratio_per_floor ?? 0.35;
  const minRemainingRatio = policy.min_remaining_usable_ratio ?? 0.55;
  const areaPrecision = policy?.rounding?.area_m2_precision ?? 0.1;
  const ratioPrecision = policy?.rounding?.ratio_precision ?? 0.001;

  for (const v of (voidNodes || [])) {
    const voidId = v?.void_id || 'VOID-UNKNOWN';
    const voidType = v?.void_type || 'UNKNOWN';
    const start = v?.span?.start_floor;
    const end = v?.span?.end_floor;

    if (typeof start !== 'number' || typeof end !== 'number' || start < 1 || end < 1) {
      warnings.push({ void_id: voidId, floor: null, code: 'MISSING_PLATE_AREA', message: `Void ${voidId} has invalid span.` });
      continue;
    }

    const effectiveSpec = getEffectiveFootprintSpec(v, selectedPatterns, footprintRules);

    for (let f = start; f <= end; f++) {
      if (f < 1 || f > floorsTotal) continue;
      const plateArea = getPlateAreaM2(building, f);
      if (plateArea == null || usable_area_by_floor[f] == null) continue;

      let mode = effectiveSpec.mode;
      let value = effectiveSpec.value;
      const override = getPerFloorOverride(effectiveSpec, f);
      if (override) { mode = override.mode; value = override.value; }

      let rawDeductArea = 0, rawDeductRatio = 0;
      let patternMultiplier = effectiveSpec?._debug?.ratioMultiplier ?? 1.0;
      let floorMultiplier = 1.0;

      if (mode === 'RATIO') {
        const fl = applyFloorLevelMultiplier(value * patternMultiplier, building, f, footprintRules);
        floorMultiplier = fl.floorMultiplier;
        rawDeductArea = (plateArea as number) * fl.ratio;
        rawDeductRatio = fl.ratio;
      } else if (mode === 'AREA_M2') {
        rawDeductArea = value;
        rawDeductRatio = rawDeductArea / (plateArea as number);
      } else if (mode === 'BY_SPACE_SET') {
        const sumAnchors = sumAnchorAreasM2(ep1, v?.anchors?.anchor_spaces || []);
        if (!sumAnchors) warnings.push({ void_id: voidId, floor: f, code: 'MISSING_ANCHOR_AREA', message: `BY_SPACE_SET: no anchor areas for ${voidId}.` });
        rawDeductArea = (sumAnchors || 0) * value;
        rawDeductRatio = (plateArea as number) > 0 ? rawDeductArea / (plateArea as number) : 0;
      } else {
        warnings.push({ void_id: voidId, floor: f, code: 'MISSING_ANCHOR_AREA', message: `Unknown mode '${mode}' for ${voidId}.` });
        continue;
      }

      let deductArea = rawDeductArea, deductRatio = rawDeductRatio;
      let clampMax = false, clampMinRemaining = false;

      if (deductRatio > maxDeductRatio) { clampMax = true; deductRatio = maxDeductRatio; deductArea = (plateArea as number) * deductRatio; }
      if (1 - deductRatio < minRemainingRatio) { clampMinRemaining = true; deductRatio = 1 - minRemainingRatio; deductArea = (plateArea as number) * deductRatio; }

      const previousUsable = usable_area_by_floor[f] as number;
      usable_area_by_floor[f] = roundTo(Math.max(0, previousUsable - deductArea), areaPrecision);

      footprint_adjustments.push({
        floor: f, void_id: voidId, void_type: voidType,
        plate_area_m2: roundTo(plateArea as number, areaPrecision),
        deduct_area_m2: roundTo(deductArea, areaPrecision),
        remaining_usable_m2: usable_area_by_floor[f] as number,
        deduct_mode: mode,
        effective_value: mode === 'RATIO' ? roundTo(deductRatio, ratioPrecision) : roundTo(value, areaPrecision),
        counts_as_gfa: Boolean(effectiveSpec.counts_as_gfa),
        clamps_applied: { max_deduct_ratio: clampMax, min_remaining_ratio: clampMinRemaining },
        debug: {
          raw_deduct_area_m2: roundTo(rawDeductArea, areaPrecision),
          raw_deduct_ratio: roundTo(rawDeductRatio, ratioPrecision),
          pattern_multiplier: roundTo(patternMultiplier, ratioPrecision),
          floor_multiplier: roundTo(floorMultiplier, ratioPrecision),
          previous_usable_m2: roundTo(previousUsable, areaPrecision),
        },
      });

      if (clampMax) warnings.push({ void_id: voidId, floor: f, code: 'CLAMP_MAX_DEDUCT', message: `${voidId} clamped by max_deduct_ratio on floor ${f}.` });
      if (clampMinRemaining) warnings.push({ void_id: voidId, floor: f, code: 'CLAMP_MIN_REMAINING', message: `${voidId} clamped to keep min_remaining_usable_ratio on floor ${f}.` });
    }
  }

  return { footprint_adjustments, warnings, usable_area_by_floor };
}
