import React, { useMemo } from 'react';
import { Checkpoint, DecisionLog } from '@/types';
import { computeAxisProfile, previewOption, AxisJudgement } from '@/services/axisProfile';

interface Props {
  logs: DecisionLog[];
  checkpoint: Checkpoint;
  previewId: string | null;
}

const JUDGEMENT_STYLES: Record<AxisJudgement, string> = {
  match:     'border-emerald-500 bg-emerald-900/20 text-emerald-300',
  weak:      'border-amber-600 bg-amber-950/20 text-amber-400',
  conflict:  'border-red-600 bg-red-950/20 text-red-400',
  forbidden: 'border-red-500 bg-red-900/30 text-red-300',
  new:       'border-indigo-500 bg-indigo-950/20 text-indigo-300',
};

const JUDGEMENT_LABELS: Record<AxisJudgement, string> = {
  match: '정합',
  weak: '약한 정합',
  conflict: '충돌',
  forbidden: '금지 위반',
  new: '신규 입장',
};

const AxisProfilePanel: React.FC<Props> = ({ logs, checkpoint, previewId }) => {
  const profile = useMemo(() => computeAxisProfile(logs), [logs]);
  const preview = useMemo(
    () => (previewId ? previewOption(profile, checkpoint, previewId) : {}),
    [profile, checkpoint, previewId]
  );

  return (
    <div className="mb-10">
      <div className="flex justify-between items-end mb-2">
        <h3 className="mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
          Axis Profile — 누적 논리 상태
        </h3>
        {previewId && <span className="mono text-[9px] text-zinc-600">PREVIEW: {previewId}</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-9 gap-1">
        {profile.map(stance => {
          const judgement = preview[stance.axis];
          const baseCls = stance.conflict
            ? 'border-red-800 bg-red-950/10 text-zinc-400'
            : 'border-zinc-800 bg-zinc-900/30 text-zinc-400';
          const cls = judgement ? JUDGEMENT_STYLES[judgement] : baseCls;
          const shown = stance.current ?? stance.preferred;
          const isPrefOnly = !stance.current && !!stance.preferred;
          const tooltip = [
            stance.axis,
            stance.preferred ? `DC1 선호: ${stance.preferred}` : null,
            stance.forbidden ? `DC1 금지: ${stance.forbidden}` : null,
            ...stance.claims.map(c => `${c.checkpoint} ${c.optionLabel}: ${c.value}`),
            stance.conflict ? '⚠ 축 내 충돌 존재' : null,
            judgement ? `미리보기: ${JUDGEMENT_LABELS[judgement]}` : null,
          ].filter(Boolean).join('\n');
          return (
            <div
              key={stance.axis}
              title={tooltip}
              className={`border px-1.5 py-1 text-center transition-colors duration-150 ${cls}`}
            >
              <div className="mono text-[8px] uppercase tracking-wide opacity-60">
                {stance.axis.slice(0, 6)}
              </div>
              <div className={`mono text-[9px] font-bold truncate ${shown ? '' : 'opacity-30'} ${isPrefOnly ? 'italic opacity-60' : ''}`}>
                {shown ?? '—'}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5 mono text-[8px] text-zinc-600">
        <span><span className="text-emerald-500">■</span> 정합</span>
        <span><span className="text-amber-500">■</span> 약한 정합</span>
        <span><span className="text-red-500">■</span> 충돌/금지</span>
        <span><span className="text-indigo-400">■</span> 신규</span>
        <span className="italic">이탤릭 = DC1 선호(미확정)</span>
      </div>
    </div>
  );
};

export default AxisProfilePanel;
