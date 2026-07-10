import { DC_LIBRARY, LOGIC_RULES } from "../data/staticData";
import { Checkpoint, CHECKPOINT_ORDER, AxisName, DecisionLog } from "../types";

export type AxisJudgement = 'match' | 'weak' | 'conflict' | 'forbidden' | 'new';

export interface AxisClaim {
  checkpoint: Checkpoint;
  optionId: string;
  optionLabel: string;
  value: string;
}

export interface AxisStance {
  axis: AxisName;
  claims: AxisClaim[];
  current: string | null;    // 가장 최근 주장 값
  preferred: string | null;  // DC1 bias_axis_pref
  forbidden: string | null;  // DC1 anti_axis_forbid
  conflict: boolean;         // claims 안에 비호환 값 쌍 존재
}

const ALL_AXES: AxisName[] = [
  "Exposure", "Encounter", "Access", "Sharing", "Temporal",
  "Separation", "Centrality", "Mass", "Expression",
];

// DC2/DC5는 라이브러리에서 'type' 필드가 id 역할 (geminiService.getOptionDetails와 동일 규칙)
function findOption(checkpoint: Checkpoint, id: string): any | null {
  const lists: Record<Checkpoint, any[]> = {
    [Checkpoint.DC1]: DC_LIBRARY.dc1_options,
    [Checkpoint.DC2]: DC_LIBRARY.dc2_types,
    [Checkpoint.DC5]: DC_LIBRARY.dc5_types,
    [Checkpoint.DC3]: DC_LIBRARY.dc3_options,
    [Checkpoint.DC4]: DC_LIBRARY.dc4_options,
    [Checkpoint.DC6]: DC_LIBRARY.dc6_options,
    [Checkpoint.DC7]: DC_LIBRARY.dc7_options,
  };
  return lists[checkpoint].find((o: any) => o.id === id || o.type === id) ?? null;
}

function isWeakPair(axis: string, a: string, b: string): boolean {
  const pairs = LOGIC_RULES.execution_spec.weak_match_pairs.find(p => p.axis === axis)?.pairs;
  if (!pairs) return false;
  return pairs.some(pair => pair.includes(a) && pair.includes(b));
}

export function computeAxisProfile(logs: DecisionLog[]): AxisStance[] {
  const ordered = [...logs].sort(
    (a, b) => CHECKPOINT_ORDER.indexOf(a.checkpoint) - CHECKPOINT_ORDER.indexOf(b.checkpoint)
  );

  const claimsByAxis = new Map<AxisName, AxisClaim[]>();
  let preferred: Partial<Record<AxisName, string>> = {};
  let forbidden: Partial<Record<AxisName, string>> = {};

  for (const entry of ordered) {
    const ids = Array.isArray(entry.selectedId) ? entry.selectedId : [entry.selectedId];
    for (const id of ids) {
      const opt = findOption(entry.checkpoint, id);
      if (!opt) continue; // 옛 localStorage의 미지 id: 판정에서 제외 (스펙 §4)
      if (entry.checkpoint === Checkpoint.DC1) {
        preferred = { ...(opt.bias_axis_pref ?? {}) };
        forbidden = { ...(opt.anti_axis_forbid ?? {}) };
        continue;
      }
      for (const [axis, value] of Object.entries(opt.engine_axes ?? {})) {
        const list = claimsByAxis.get(axis as AxisName) ?? [];
        list.push({ checkpoint: entry.checkpoint, optionId: id, optionLabel: opt.label, value: value as string });
        claimsByAxis.set(axis as AxisName, list);
      }
    }
  }

  return ALL_AXES.map(axis => {
    const claims = claimsByAxis.get(axis) ?? [];
    const current = claims.length ? claims[claims.length - 1].value : null;
    let conflict = false;
    outer: for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i].value, b = claims[j].value;
        if (a !== b && !isWeakPair(axis, a, b)) { conflict = true; break outer; }
      }
    }
    return {
      axis,
      claims,
      current,
      preferred: preferred[axis] ?? null,
      forbidden: forbidden[axis] ?? null,
      conflict,
    };
  });
}
