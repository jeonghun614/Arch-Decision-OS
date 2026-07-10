import { calculateAvailableOptions } from "./logicEngine";
import { Checkpoint, CHECKPOINT_ORDER, DecisionLog, SelectionState, BlockedOption } from "../types";

export interface ChainStep {
  checkpoint: Checkpoint;
  selected: { id: string; label: string; hadWarning: boolean }[];
  blocked: BlockedOption[];
}

export interface ChainEdge {
  fromCheckpoint: Checkpoint;
  toCheckpoint: Checkpoint;
  blockedOptionId: string;
  blockedOptionLabel: string;
  reason: string;
}

export interface DecisionChain {
  steps: ChainStep[];
  edges: ChainEdge[];
}

// "DC2" | "DC5(DC5.A)" | "DC1 Logic" | "DC2 Combo" → 원인 체크포인트
export function parseBlockSource(blockedBy: string, fallback: Checkpoint): Checkpoint {
  const m = blockedBy.match(/DC\d/);
  if (m && CHECKPOINT_ORDER.includes(m[0] as Checkpoint)) {
    return m[0] as Checkpoint;
  }
  return fallback;
}

function emptySelections(): SelectionState {
  return { dc1_id: null, dc2_type: null, dc5_types: [], dc3_ids: [], dc4_ids: [], dc6_ids: [], dc7_ids: [] };
}

function applySelection(sel: SelectionState, checkpoint: Checkpoint, ids: string[]): void {
  if (checkpoint === Checkpoint.DC1) sel.dc1_id = ids[0] ?? null;
  if (checkpoint === Checkpoint.DC2) sel.dc2_type = ids[0] ?? null;
  if (checkpoint === Checkpoint.DC5) sel.dc5_types = ids;
  if (checkpoint === Checkpoint.DC3) sel.dc3_ids = ids;
  if (checkpoint === Checkpoint.DC4) sel.dc4_ids = ids;
  if (checkpoint === Checkpoint.DC6) sel.dc6_ids = ids;
  if (checkpoint === Checkpoint.DC7) sel.dc7_ids = ids;
}

export function replayDecisionChain(logs: DecisionLog[]): DecisionChain {
  const byCp = new Map(logs.map(l => [l.checkpoint, l]));
  const sel = emptySelections();
  const steps: ChainStep[] = [];
  const edges: ChainEdge[] = [];
  let prevDecided: Checkpoint = Checkpoint.DC1;

  for (const cp of CHECKPOINT_ORDER) {
    const entry = byCp.get(cp);
    if (!entry) break; // 중도 이탈: 있는 단계까지만 (스펙 §3.3)

    const { allowed, blocked } = calculateAvailableOptions(cp, sel);
    const ids = Array.isArray(entry.selectedId) ? entry.selectedId : [entry.selectedId];
    const labels = Array.isArray(entry.selectedLabel) ? entry.selectedLabel : [entry.selectedLabel];

    steps.push({
      checkpoint: cp,
      selected: ids.map((id, i) => ({
        id,
        label: labels[i] ?? id,
        hadWarning: allowed.find(o => o.id === id)?.status === 'warning',
      })),
      blocked,
    });

    for (const b of blocked) {
      for (const src of b.blocked_by) {
        edges.push({
          fromCheckpoint: parseBlockSource(src, prevDecided),
          toCheckpoint: cp,
          blockedOptionId: b.id,
          blockedOptionLabel: b.label,
          reason: b.reason,
        });
      }
    }

    applySelection(sel, cp, ids);
    prevDecided = cp;
  }

  return { steps, edges };
}
