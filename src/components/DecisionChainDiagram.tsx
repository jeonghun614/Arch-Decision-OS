import React, { useMemo } from 'react';
import { Checkpoint, CHECKPOINT_LABELS, DecisionLog } from '@/types';
import { replayDecisionChain } from '@/services/decisionChain';

interface Props {
  logs: DecisionLog[];
}

const NODE_H = 22;
const NODE_GAP = 6;
const ROW_PAD = 20;
const SEL_X = 10;
const SEL_W = 190;
const BLK_X = 300;
const BLK_W = 214;
const WIDTH = 524;

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const DecisionChainDiagram: React.FC<Props> = ({ logs }) => {
  const chain = useMemo(() => replayDecisionChain(logs), [logs]);

  if (chain.edges.length === 0) return null;

  // 행 높이: 그 단계의 노드 수(선택 vs 차단 중 많은 쪽)에 비례
  const rows = chain.steps.map(step => {
    const lines = Math.max(step.selected.length, step.blocked.length, 1);
    return ROW_PAD * 2 + lines * (NODE_H + NODE_GAP);
  });
  const rowY: number[] = [];
  let acc = 0;
  rows.forEach(h => { rowY.push(acc); acc += h; });
  const totalH = acc;

  const cpIndex = new Map<Checkpoint, number>(chain.steps.map((s, i) => [s.checkpoint, i]));
  const nodeY = (rowIdx: number, nodeIdx: number) =>
    rowY[rowIdx] + ROW_PAD + nodeIdx * (NODE_H + NODE_GAP);

  return (
    <div className="border border-zinc-800 p-6 bg-zinc-950">
      <h2 className="mono text-[10px] text-red-500/80 font-bold mb-4 uppercase tracking-widest border-b border-zinc-900 pb-2">
        Constraint Chain — 결정이 차단한 것들
      </h2>
      <svg viewBox={`0 0 ${WIDTH} ${totalH}`} className="w-full h-auto">
        {/* 엣지를 노드 아래 레이어에 먼저 그린다 */}
        {chain.edges.map((e, i) => {
          const fi = cpIndex.get(e.fromCheckpoint);
          const ti = cpIndex.get(e.toCheckpoint);
          if (fi === undefined || ti === undefined) return null;
          const blkIdx = chain.steps[ti].blocked.findIndex(b => b.id === e.blockedOptionId);
          if (blkIdx < 0) return null;
          const x1 = SEL_X + SEL_W;
          const y1 = nodeY(fi, 0) + NODE_H / 2;
          const x2 = BLK_X;
          const y2 = nodeY(ti, blkIdx) + NODE_H / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="#7f1d1d"
              strokeWidth="1"
              opacity="0.7"
            >
              <title>{`[${e.fromCheckpoint} → ${e.toCheckpoint}] ${e.blockedOptionLabel}\n${e.reason}`}</title>
            </path>
          );
        })}
        {chain.steps.map((step, i) => (
          <g key={step.checkpoint}>
            <text
              x={SEL_X} y={rowY[i] + 12}
              fontSize="8" fill="#52525b"
              fontFamily="'JetBrains Mono', monospace"
            >
              {step.checkpoint} · {CHECKPOINT_LABELS[step.checkpoint]}
            </text>
            {step.selected.map((s, si) => (
              <g key={s.id}>
                <title>{s.hadWarning ? `${s.label}\n(경고를 수락하고 선택)` : s.label}</title>
                <rect
                  x={SEL_X} y={nodeY(i, si)} width={SEL_W} height={NODE_H} rx="2"
                  fill="#064e3b" fillOpacity="0.35"
                  stroke={s.hadWarning ? '#d97706' : '#059669'} strokeWidth="1"
                />
                <text
                  x={SEL_X + 8} y={nodeY(i, si) + 14.5}
                  fontSize="9" fill={s.hadWarning ? '#fbbf24' : '#6ee7b7'}
                >
                  {truncate(s.label, 24)}
                </text>
              </g>
            ))}
            {step.blocked.map((b, bi) => (
              <g key={b.id}>
                <title>{`${b.label}\nBLOCKED BY ${b.blocked_by.join(', ')}\n${b.reason}`}</title>
                <rect
                  x={BLK_X} y={nodeY(i, bi)} width={BLK_W} height={NODE_H} rx="2"
                  fill="#450a0a" fillOpacity="0.25"
                  stroke="#7f1d1d" strokeWidth="1" strokeDasharray="3 2"
                />
                <text
                  x={BLK_X + 8} y={nodeY(i, bi) + 14.5}
                  fontSize="9" fill="#f87171" opacity="0.7"
                  textDecoration="line-through"
                >
                  {truncate(b.label, 26)}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <div className="mono text-[8px] text-zinc-600 mt-2">
        실선 = 선택 (amber 테두리 = 경고 수락) · 점선 = 차단됨 · 곡선 = 차단 원인 결정 · 노드에 마우스를 올리면 사유 표시
      </div>
    </div>
  );
};

export default DecisionChainDiagram;
