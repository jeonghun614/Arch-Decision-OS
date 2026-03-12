import React from 'react';
import { CHECKPOINT_LABELS } from '@/types';
import mappingData from '@/data/dc_to_grammar_mapping.json';
import { AppContext } from '../hooks/useProjectState';

interface Props {
  ctx: AppContext;
}

const ResultPage: React.FC<Props> = ({ ctx }) => {
  const {
    state,
    activeTab,
    setActiveTab,
    showGuideModal,
    setShowGuideModal,
    handleRestart,
    handleGenerateVisualGuide,
    visualGuide,
    guideLoading,
    activeGuideCheckpoint,
    activeSelection,
    generatedPrompt,
    isGeneratingPrompt,
    handleGeneratePrompt,
    copyToClipboard,
  } = ctx;

  return (
    <div className="min-h-screen p-8 bg-black text-white flex flex-col items-center">
      <div className="max-w-4xl w-full pb-20">
        <h1 className="text-3xl font-bold mono text-emerald-500 mb-8 text-center">DECISION LOGIC COMPLETE</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 items-start">
          {/* Left Column: Decisions & Logic */}
          <div className="lg:col-span-1 space-y-8">
            {/* 1. Decision Summary */}
            <div className="border border-zinc-800 p-6 bg-zinc-950">
              <h2 className="mono text-[10px] text-emerald-600 font-bold mb-6 uppercase tracking-widest border-b border-zinc-900 pb-2">1. Decision Summary</h2>
              <div className="space-y-4">
                {state.logs.map((log, i) => (
                  <div key={i} className="flex flex-col border-b border-zinc-900 pb-4 last:border-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="mono text-[10px] text-zinc-500">{CHECKPOINT_LABELS[log.checkpoint]}</span>
                      <button
                        onClick={() => handleGenerateVisualGuide(log.checkpoint, log.selectedId, log.selectedLabel)}
                        className="text-[10px] mono border border-zinc-700 px-2 py-0.5 hover:bg-zinc-800 hover:text-white transition-colors text-zinc-500"
                      >
                        + GUIDE
                      </button>
                    </div>
                    <div className="font-bold text-sm text-zinc-300">
                      {Array.isArray(log.selectedLabel) ? log.selectedLabel.join(" + ") : log.selectedLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Design Logic Explanation */}
            <div className="border border-zinc-800 p-6 bg-black relative">
              <h2 className="mono text-[10px] text-indigo-500 font-bold mb-6 uppercase tracking-widest border-b border-zinc-900 pb-2">2. Narrative Logic</h2>

              {!state.finalReport ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <div className="mono text-[9px] text-zinc-600 text-center uppercase">Synthesizing...</div>
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in duration-700">
                  <div>
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Core Logic</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{state.finalReport.core_logic}</p>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Causality</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">{state.finalReport.causality}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Grammar Compiler (Tab UI) */}
          <div className="lg:col-span-2 border border-zinc-800 bg-zinc-950 overflow-hidden self-stretch flex flex-col">
            <div className="flex border-b border-zinc-800 bg-black">
              <button
                onClick={() => setActiveTab('grammar')}
                className={`px-6 py-4 mono text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'grammar' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                TAB 1: Spatial Grammar
              </button>
              <button
                onClick={() => setActiveTab('programs')}
                className={`px-6 py-4 mono text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'programs' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                TAB 2: Program & Area
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`px-6 py-4 mono text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'json' ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                TAB 3: Blueprint JSON
              </button>
            </div>

            <div className="p-8 flex-1 overflow-y-auto max-h-[800px]">
              {!state.grammarResult ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <div className="mono text-xs text-zinc-500">COMPILING SPATIAL GRAMMAR...</div>
                </div>
              ) : (
                <>
                  {activeTab === 'grammar' && (
                    <div className="animate-in fade-in duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-black p-6 border border-zinc-900">
                          <h3 className="mono text-[10px] text-emerald-600 font-bold uppercase mb-4 border-b border-zinc-900 pb-2">Topology & Massing</h3>
                          <div className="space-y-4">
                            <div>
                              <div className="text-[10px] mono text-zinc-600 mb-1">Topology Type</div>
                              <div className="text-sm font-bold text-white">{state.grammarResult.grammar.topology.type}</div>
                            </div>
                            <div>
                              <div className="text-[10px] mono text-zinc-600 mb-1">Cluster Count Range</div>
                              <div className="text-sm font-bold text-white">{state.grammarResult.grammar.topology.cluster_count_range.join(' ~ ')}</div>
                            </div>
                            <div>
                              <div className="text-[10px] mono text-zinc-600 mb-1">Centrality Strategy</div>
                              <div className="text-sm font-bold text-white">{state.grammarResult.grammar.topology.centrality}</div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-black p-6 border border-zinc-900">
                          <h3 className="mono text-[10px] text-indigo-500 font-bold uppercase mb-4 border-b border-zinc-900 pb-2">Circulation & Access</h3>
                          <div className="space-y-4">
                            <div>
                              <div className="text-[10px] mono text-zinc-600 mb-1">Circulation Type</div>
                              <div className="text-sm font-bold text-white">{state.grammarResult.grammar.circulation.type}</div>
                            </div>
                            <div>
                              <div className="text-[10px] mono text-zinc-600 mb-1">Min Routes</div>
                              <div className="text-sm font-bold text-white">{state.grammarResult.grammar.circulation.min_routes}</div>
                            </div>
                            <div className="flex gap-4">
                              <div>
                                <div className="text-[10px] mono text-zinc-600 mb-1">Staged Entry</div>
                                <div className={`text-xs font-bold ${state.grammarResult.grammar.circulation.staged_entry ? 'text-emerald-500' : 'text-zinc-700'}`}>
                                  {state.grammarResult.grammar.circulation.staged_entry ? 'YES' : 'NO'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] mono text-zinc-600 mb-1">Time Layered</div>
                                <div className={`text-xs font-bold ${state.grammarResult.grammar.circulation.time_layered ? 'text-emerald-500' : 'text-zinc-700'}`}>
                                  {state.grammarResult.grammar.circulation.time_layered ? 'YES' : 'NO'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="bg-black p-6 border border-zinc-900">
                        <h3 className="mono text-[10px] text-zinc-500 font-bold uppercase mb-4 border-b border-zinc-900 pb-2">Structural & Expression Logic</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                              <span className="text-[10px] mono text-zinc-600 uppercase">System</span>
                              <span className="text-xs font-bold text-zinc-300">{state.grammarResult.grammar.structural_logic.system}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                              <span className="text-[10px] mono text-zinc-600 uppercase">Grid Based</span>
                              <span className="text-xs font-bold text-zinc-300">{state.grammarResult.grammar.structural_logic.grid_based ? 'TRUE' : 'FALSE'}</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                              <span className="text-[10px] mono text-zinc-600 uppercase">Language</span>
                              <span className="text-xs font-bold text-zinc-300">{state.grammarResult.grammar.expression_logic.language}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
                              <span className="text-[10px] mono text-zinc-600 uppercase">Opacity</span>
                              <span className="text-xs font-bold text-zinc-300">{state.grammarResult.grammar.expression_logic.opacity_range.join(' ~ ')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'programs' && (
                    <div className="animate-in fade-in duration-500">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        {[
                          { label: "Site Area", value: state.grammarResult.computed.site_area_m2, unit: "m2" },
                          { label: "Footprint", value: state.grammarResult.computed.footprint_m2, unit: "m2" },
                          { label: "Gross Area", value: state.grammarResult.computed.gross_floor_area_m2, unit: "m2" },
                          { label: "Net Program", value: state.grammarResult.computed.net_program_area_m2, unit: "m2" }
                        ].map((stat, i) => (
                          <div key={i} className="bg-black p-4 border border-zinc-900">
                            <div className="text-[10px] mono text-zinc-600 mb-1 uppercase">{stat.label}</div>
                            <div className="text-lg font-bold text-white">
                              {Math.round(stat.value).toLocaleString()} <span className="text-[10px] text-zinc-600 font-normal">{stat.unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mb-8 overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="py-3 px-4 mono text-[10px] text-zinc-500 uppercase">ID</th>
                              <th className="py-3 px-4 mono text-[10px] text-zinc-500 uppercase">Type</th>
                              <th className="py-3 px-4 mono text-[10px] text-zinc-500 uppercase">Label</th>
                              <th className="py-3 px-4 mono text-[10px] text-zinc-500 uppercase text-right">Target (m2)</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {(state.grammarResult.blueprint?.programs ?? []).map(p => (
                              <tr key={p.id} className="border-b border-zinc-900 hover:bg-white/5 transition-colors">
                                <td className="py-3 px-4 mono text-zinc-500">{p.id}</td>
                                <td className="py-3 px-4">
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                    p.type === 'PRIMARY' ? 'bg-emerald-900 text-emerald-400' :
                                    p.type === 'PRIVATE' ? 'bg-indigo-900 text-indigo-400' :
                                    p.type === 'SHARED' ? 'bg-amber-900 text-amber-400' :
                                    'bg-zinc-800 text-zinc-400'
                                  }`}>
                                    {p.type}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-zinc-300">{p.label}</td>
                                <td className="py-3 px-4 text-right font-bold text-white">{Math.round(p.area_target_m2).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-black p-6 border border-zinc-900">
                          <h4 className="mono text-[10px] text-zinc-500 uppercase mb-4">Relations (V/A/R)</h4>
                          <div className="space-y-2">
                            {(state.grammarResult.blueprint?.relations?.edges ?? []).map((e, i) => (
                              <div key={i} className="flex justify-between items-center text-[11px] border-b border-zinc-900 pb-2">
                                <span className="text-zinc-400">{e.from} ↔ {e.to}</span>
                                <span className="mono">V:{e.visibility} A:{e.adjacency} <span className="text-emerald-500 font-bold ml-2">R:{e.r_score}</span></span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="bg-black p-6 border border-zinc-900">
                          <h4 className="mono text-[10px] text-zinc-500 uppercase mb-4">Floor Allocation</h4>
                          <div className="space-y-3">
                            {(state.grammarResult.blueprint?.allocation?.floor_assignment ?? []).map(f => (
                              <div key={f.floor} className="flex gap-4 items-center">
                                <div className="mono text-[9px] bg-zinc-800 px-2 py-1 text-zinc-400">FL {f.floor}</div>
                                <div className="flex flex-wrap gap-1">
                                  {f.program_ids.map(pid => (
                                    <span key={pid} className="text-[9px] border border-zinc-800 px-2 py-0.5 text-zinc-500">{pid}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'json' && (
                    <div className="animate-in fade-in duration-500 flex flex-col h-full">
                      <div className="flex gap-3 mb-4">
                        <div className={`text-[9px] mono px-3 py-1 rounded-full font-bold border ${
                          state.ep1Status === 'done' ? 'border-emerald-500 text-emerald-400 bg-emerald-900/30' :
                          state.ep1Status === 'loading' ? 'border-amber-500 text-amber-400 bg-amber-900/30 animate-pulse' :
                          state.ep1Status === 'error' ? 'border-red-500 text-red-400 bg-red-900/30' :
                          'border-zinc-700 text-zinc-500'
                        }`}>
                          EP1 PROGRAM TREE {state.ep1Status === 'loading' ? '...' : state.ep1Status.toUpperCase()}
                        </div>
                        <div className={`text-[9px] mono px-3 py-1 rounded-full font-bold border ${
                          state.ep2Status === 'done' ? 'border-emerald-500 text-emerald-400 bg-emerald-900/30' :
                          state.ep2Status === 'loading' ? 'border-amber-500 text-amber-400 bg-amber-900/30 animate-pulse' :
                          state.ep2Status === 'error' ? 'border-red-500 text-red-400 bg-red-900/30' :
                          'border-zinc-700 text-zinc-500'
                        }`}>
                          EP2 VOID ENGINE {state.ep2Status === 'loading' ? '...' : state.ep2Status.toUpperCase()}
                        </div>
                        {state.grammarResult?.program_tree && (
                          <div className="text-[9px] mono px-3 py-1 text-zinc-400">
                            {state.grammarResult.program_tree.spaces.length} spaces · {state.grammarResult.program_tree.clusters.length} clusters
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-[10px] mono text-zinc-500 uppercase">Blueprint IR JSON</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(state.grammarResult, null, 2));
                              alert("JSON copied!");
                            }}
                            className="text-[10px] mono bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-white transition-colors"
                          >
                            COPY
                          </button>
                          <button
                            onClick={() => {
                              const blob = new Blob([JSON.stringify(state.grammarResult, null, 2)], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `blueprint_${state.projectName.replace(/\s+/g, '_')}.json`;
                              a.click();
                            }}
                            className="text-[10px] mono bg-emerald-700 hover:bg-emerald-600 px-3 py-1 text-white transition-colors"
                          >
                            DOWNLOAD
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 bg-black border border-zinc-900 p-4 overflow-auto max-h-[500px]">
                        <pre className="text-[10px] text-emerald-500/80 font-mono leading-relaxed">
                          {JSON.stringify(state.grammarResult, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <button onClick={handleRestart} className="w-full py-4 border border-zinc-700 hover:bg-zinc-900 text-sm mono uppercase transition-all">
          RESET SYSTEM & START NEW PROJECT
        </button>
      </div>

      {/* Visual Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200 shadow-2xl shadow-black grid grid-cols-1 lg:grid-cols-2">
            <button
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white z-10 bg-black/50 rounded-full p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {/* Left: Logic Guide */}
            <div className="p-8 border-r border-zinc-800 overflow-y-auto max-h-[80vh]">
              {guideLoading || !visualGuide ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <div className="mono text-xs text-zinc-500">ANALYZING LOGIC STRUCTURE...</div>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="border-b border-zinc-800 pb-4">
                    <div className="mono text-[10px] text-emerald-600 mb-2 uppercase">Decision Logic: {CHECKPOINT_LABELS[activeGuideCheckpoint!]}</div>
                    <h2 className="text-2xl font-bold text-white mb-2">{visualGuide.title}</h2>
                    <p className="text-sm text-zinc-400">"{visualGuide.core_message}"</p>
                  </div>

                  <div>
                    <h3 className="mono text-xs text-zinc-500 font-bold uppercase mb-3">Logic Structure & Mechanics</h3>
                    <ul className="space-y-2">
                      {visualGuide.logic_structure.map((step, i) => (
                        <li key={i} className="text-sm text-zinc-300 flex items-start">
                          <span className="text-indigo-500 mr-2 mt-0.5">▪</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <h3 className="mono text-xs text-emerald-600/80 font-bold uppercase mb-2">Design Strategies (Recommended)</h3>
                      <ul className="space-y-2">
                        {visualGuide.design_strategies.map((item, i) => (
                          <li key={i} className="text-xs text-zinc-400 flex items-start">
                            <span className="text-emerald-500 mr-2">✓</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="mono text-xs text-red-500/70 font-bold uppercase mb-2">Prohibitions (Avoid)</h3>
                      <ul className="space-y-1">
                        {visualGuide.prohibitions.map((item, i) => (
                          <li key={i} className="text-xs text-red-400/80 flex items-start">
                            <span className="mr-2">X</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="bg-zinc-900 p-6 border border-zinc-800 mt-4">
                    <h3 className="mono text-[10px] text-zinc-500 font-bold uppercase mb-2">Presentation Script</h3>
                    <p className="text-base text-white font-serif italic">"{visualGuide.presentation_speech}"</p>
                  </div>

                  <div className="mt-8 pt-8 border-t border-zinc-800">
                    <h3 className="mono text-xs text-emerald-500 font-bold uppercase mb-4 tracking-widest">Grammar Extract</h3>
                    <div className="bg-black p-6 border border-zinc-900 space-y-4">
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        이 결정({Array.isArray(activeSelection?.label) ? activeSelection.label.join(' + ') : activeSelection?.label})은 공간 문법의 다음 파라미터에 기여합니다:
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {(() => {
                          const checkpointKey = activeGuideCheckpoint as string;
                          const mappingDc = (mappingData.dc as any)[checkpointKey];
                          const affectedKeys = new Set<string>();

                          if (mappingDc && activeSelection) {
                            const labels = Array.isArray(activeSelection.label) ? activeSelection.label : [activeSelection.label];
                            labels.forEach(label => {
                              const optionMapping = mappingDc.options[label];
                              if (optionMapping && optionMapping.apply) {
                                Object.keys(optionMapping.apply).forEach(key => affectedKeys.add(key));
                              }
                            });
                          }

                          if (affectedKeys.size > 0) {
                            return (
                              <div className="text-[11px] text-zinc-300 font-mono">
                                <span className="text-emerald-500">▪</span> {Array.from(affectedKeys).join(', ')}
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-[11px] text-zinc-500 italic">
                                이 결정은 기본 문법 구조를 유지합니다.
                              </div>
                            );
                          }
                        })()}
                        <div className="text-[11px] text-zinc-500 italic mt-2">
                          * 상세 수치는 Blueprint JSON의 logic_trace에서 확인 가능합니다.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Grammar Compiler (Tab UI) */}
            <div className="p-8 bg-black flex flex-col h-[80vh] border-l border-zinc-800">
              <div className="flex border-b border-zinc-900 mb-6">
                {['grammar', 'programs', 'json'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-4 py-2 mono text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === tab ? 'text-emerald-500 border-b-2 border-emerald-500 bg-zinc-900' : 'text-zinc-600 hover:text-zinc-400'}`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {activeTab === 'grammar' && state.grammarResult && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Topology", value: state.grammarResult.grammar.topology?.type },
                        { label: "Centrality", value: state.grammarResult.grammar.topology?.centrality },
                        { label: "Buffer", value: state.grammarResult.grammar.buffer?.strategy },
                        { label: "Circulation", value: state.grammarResult.grammar.circulation?.type }
                      ].map((item, i) => (
                        <div key={i} className="bg-zinc-900/50 p-3 border border-zinc-800">
                          <div className="text-[8px] mono text-zinc-600 mb-1 uppercase">{item.label}</div>
                          <div className="text-xs font-bold text-white truncate">{item.value ?? '-'}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Structure", value: state.grammarResult.grammar.structural_logic?.system },
                        { label: "Expression", value: state.grammarResult.grammar.expression_logic?.language },
                      ].map((item, i) => (
                        <div key={i} className="bg-zinc-900/50 p-3 border border-zinc-800">
                          <div className="text-[8px] mono text-zinc-600 mb-1 uppercase">{item.label}</div>
                          <div className="text-xs font-bold text-white truncate">{item.value ?? '-'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'programs' && state.grammarResult && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      {state.grammarResult.blueprint.programs.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-[10px] border-b border-zinc-900 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="mono text-zinc-600">{p.id}</span>
                            <span className="text-zinc-300 truncate max-w-[100px]">{p.label}</span>
                          </div>
                          <span className="mono text-emerald-500">{Math.round(p.area_target_m2)}m2</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'json' && state.grammarResult && (
                  <div className="animate-in fade-in duration-300 h-full flex flex-col">
                    <div className="flex-1 bg-zinc-900/30 border border-zinc-800 p-3 overflow-auto">
                      <pre className="text-[9px] text-emerald-500/60 font-mono leading-tight">
                        {JSON.stringify(state.grammarResult, null, 2)}
                      </pre>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(state.grammarResult, null, 2));
                          alert("JSON copied!");
                        }}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white text-[9px] font-bold py-2 mono uppercase transition-all"
                      >
                        COPY
                      </button>
                      <button
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(state.grammarResult, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `blueprint.json`;
                          a.click();
                        }}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] font-bold py-2 mono uppercase transition-all"
                      >
                        DOWNLOAD
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultPage;
