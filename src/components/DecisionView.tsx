import React from 'react';
import { Checkpoint, CHECKPOINT_ORDER, CHECKPOINT_LABELS, CHECKPOINT_LIMITS } from '@/types';
import { AppContext } from '../hooks/useProjectState';

interface Props {
  ctx: AppContext;
}

const DecisionView: React.FC<Props> = ({ ctx }) => {
  const {
    state,
    loading,
    currentSelections,
    handleToggleOption,
    handleConfirmDecision,
    handleGoBack,
  } = ctx;

  const k = state.lastEngineOutput;
  const maxLimit = CHECKPOINT_LIMITS[state.currentCheckpoint];

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-zinc-300 font-sans">
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-black sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="mono text-xs text-emerald-600 font-bold">ARCH-DECISION OS</div>
          <div className="text-[10px] mono text-zinc-600 uppercase border-l border-zinc-800 pl-4">{state.projectName}</div>
        </div>
        <div className="mono text-xs text-zinc-500">
          STAGE: {state.currentCheckpoint}
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 pt-6 md:px-12 md:pt-12 pb-40">
        {loading || !k ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 pt-20">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <div className="mono text-xs text-zinc-600">ANALYZING PROJECT CONTEXT...</div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            <div className="mb-12">
              <h2 className="text-sm font-bold text-zinc-500 mono uppercase mb-2">{CHECKPOINT_LABELS[state.currentCheckpoint]}</h2>
              <p className="text-xl text-white font-light leading-relaxed mb-6">"{k.next_action}"</p>

              <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm text-sm text-zinc-400">
                <span className="text-emerald-600 font-bold mr-2">LOGIC STATUS:</span>
                {k.logic_summary}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {/* Allowed Options */}
              <div>
                <div className="flex justify-between items-end mb-4 border-b border-zinc-900 pb-2">
                  <h3 className="mono text-[10px] text-emerald-700 font-bold uppercase tracking-widest">Available Options</h3>
                  <span className="mono text-[10px] text-zinc-500">
                    SELECT MAX {maxLimit} {state.currentCheckpoint === Checkpoint.DC5 && "(PRI + SEC)"}
                  </span>
                </div>

                <div className="space-y-3">
                  {k.available_options.map(opt => {
                    const isSelected = currentSelections.includes(opt.id);
                    const isRecommended = k.ai_recommendation?.best_option_id === opt.id;
                    const selectionIndex = currentSelections.indexOf(opt.id);
                    const isPrimary = state.currentCheckpoint === Checkpoint.DC5 && selectionIndex === 0;
                    const isSecondary = state.currentCheckpoint === Checkpoint.DC5 && selectionIndex === 1;

                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleToggleOption(opt.id)}
                        className={`w-full text-left p-4 border transition-all duration-200 relative group ${
                          isSelected
                            ? 'border-emerald-600 bg-emerald-900/10'
                            : isRecommended
                              ? 'border-indigo-500/50 bg-indigo-950/10 hover:bg-indigo-950/20'
                              : opt.status === 'warning'
                                ? 'border-amber-900/30 bg-amber-950/10 hover:bg-amber-950/20'
                                : 'border-zinc-800 bg-zinc-900/20 hover:bg-zinc-900 hover:border-zinc-600'
                        }`}
                      >
                        {isRecommended && (
                          <div className="absolute -top-2 left-4 px-2 py-0.5 bg-indigo-600 text-[9px] text-white font-bold tracking-wider shadow-lg shadow-indigo-900/50">
                            AI RECOMMENDATION
                          </div>
                        )}

                        {isSelected && (
                          <div className="absolute top-2 right-2 flex gap-1">
                            {isPrimary && <span className="text-[9px] bg-emerald-600 text-black font-bold px-1">PRI</span>}
                            {isSecondary && <span className="text-[9px] bg-zinc-600 text-white font-bold px-1">SEC</span>}
                            {!isPrimary && !isSecondary && <div className="w-2 h-2 bg-emerald-500 rounded-full" />}
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-1 pt-1">
                          <span className={`text-sm font-bold ${opt.status === 'warning' ? 'text-amber-500' : isSelected ? 'text-white' : 'text-zinc-300'}`}>{opt.label}</span>
                          <span className="mono text-[10px] text-zinc-600 ml-2">{opt.id}</span>
                        </div>

                        {isRecommended && !isSelected && (
                          <div className="mt-2 text-[10px] text-indigo-300/80 leading-tight">
                            💡 {k.ai_recommendation?.reason}
                          </div>
                        )}

                        {opt.status === 'warning' && (
                          <div className="mt-2 text-[10px] text-amber-600/80">
                            {opt.warning_reason}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {k.available_options.length === 0 && (
                    <div className="p-4 border border-red-900/30 bg-red-950/10 text-red-500 text-xs">
                      NO VIABLE OPTIONS. LOGIC DEADLOCK.
                      <br/>Please restart and choose different initial constraints.
                    </div>
                  )}
                </div>
              </div>

              {/* Blocked / Info */}
              <div className="space-y-8">
                {k.blocked_options.length > 0 && (
                  <div>
                    <h3 className="mono text-[10px] text-zinc-700 font-bold uppercase tracking-widest mb-4 border-b border-zinc-900 pb-2">Blocked Options (Logic Violation)</h3>
                    <div className="space-y-2 opacity-60">
                      {k.blocked_options.map(opt => (
                        <div key={opt.id} className="p-3 border border-zinc-900 bg-black text-zinc-600 text-xs">
                          <div className="line-through decoration-zinc-700">{opt.label}</div>
                          <div className="mt-1 text-[10px] text-red-900">
                            BLOCKED BY [{opt.blocked_by.join(', ')}]: {opt.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4 border-b border-zinc-900 pb-2">Critic Ready Statements</h3>
                  <ul className="space-y-2">
                    {k.critic_ready_statement.map((s, i) => (
                      <li key={i} className="text-xs text-zinc-400 italic pl-3 border-l border-zinc-800">"{s}"</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4 border-b border-zinc-900 pb-2">Do Not Do</h3>
                  <ul className="space-y-2">
                    {k.do_not_do.map((s, i) => (
                      <li key={i} className="text-xs text-red-900/70 pl-3">X {s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-black/90 border-t border-zinc-800 p-4 backdrop-blur-md z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            {CHECKPOINT_ORDER.indexOf(state.currentCheckpoint) > 0 && (
              <button
                onClick={handleGoBack}
                className="border border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-white font-bold py-3 px-6 mono uppercase transition-all text-xs"
              >
                ← BACK
              </button>
            )}
            <div className="text-xs text-zinc-500">
              {currentSelections.length} / {maxLimit} SELECTED
              {state.currentCheckpoint === Checkpoint.DC5 && currentSelections.length === 2 && " (Dual Axis Enabled)"}
            </div>
          </div>
          <button
            onClick={handleConfirmDecision}
            disabled={currentSelections.length === 0}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold py-3 px-8 mono uppercase transition-all"
          >
            CONFIRM SELECTION
          </button>
        </div>
      </div>
    </div>
  );
};

export default DecisionView;
