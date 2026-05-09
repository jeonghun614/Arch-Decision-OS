import React, { useState } from 'react';
import { CHECKPOINT_LABELS } from '@/types';
import mappingData from '@/data/dc_to_grammar_mapping.json';
import { AppContext } from '../hooks/useProjectState';
import { buildDesignBrief } from '../utils/designBrief';

const DIFFUSION_SERVER = 'http://localhost:5050';

interface FloorResult {
  floor: number;
  png_base64: string;
  rooms: { room_id: string; room_name: string; space_type: string; area_m2: number }[];
  site_width_mm: number;
  site_depth_mm: number;
}
interface FloorplanResult {
  floors: FloorResult[];
  site_width_mm: number;
  site_depth_mm: number;
  floor_to_floor_mm: number;
}

interface Props {
  ctx: AppContext;
}

const ResultPage: React.FC<Props> = ({ ctx }) => {
  const [floorplanLoading, setFloorplanLoading] = useState(false);
  const [floorplanResult, setFloorplanResult] = useState<FloorplanResult | null>(null);
  const [floorplanError, setFloorplanError] = useState<string | null>(null);

  const handleGenerateFloorplan = async () => {
    if (!ctx.state.grammarResult) return;
    setFloorplanLoading(true);
    setFloorplanError(null);
    setFloorplanResult(null);
    try {
      const res = await fetch(`${DIFFUSION_SERVER}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ctx.state.grammarResult),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `서버 오류 ${res.status}`);
      }
      const data = await res.json();
      setFloorplanResult(data);
    } catch (e: any) {
      setFloorplanError(e.message ?? '서버 연결 실패 — HouseDiffusion 서버가 실행 중인지 확인하세요.');
    } finally {
      setFloorplanLoading(false);
    }
  };

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
                TAB 3: Design Brief
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
                          { label: "Site Area", value: state.grammarResult.computed.site_area_mm2 / 1e6, unit: "m²" },
                          { label: "Footprint", value: state.grammarResult.computed.footprint_mm2 / 1e6, unit: "m²" },
                          { label: "Gross Area", value: state.grammarResult.computed.gross_floor_area_mm2 / 1e6, unit: "m²" },
                          { label: "Net Program", value: state.grammarResult.computed.net_program_area_mm2 / 1e6, unit: "m²" }
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
                              <th className="py-3 px-4 mono text-[10px] text-zinc-500 uppercase text-right">Target (m²)</th>
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
                                <td className="py-3 px-4 text-right font-bold text-white">{Math.round(p.area_target_mm2 / 1e6).toLocaleString()}</td>
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
                    <div className="animate-in fade-in duration-500 space-y-6">
                      {/* AI 서술 섹션 */}
                      {state.finalReport && (
                        <div className="space-y-4">
                          <div className="bg-black p-5 border border-zinc-900">
                            <h3 className="mono text-[10px] text-indigo-400 font-bold uppercase mb-2 pb-2 border-b border-zinc-900">공간 경험 시나리오</h3>
                            <p className="text-xs text-zinc-300 leading-relaxed">{state.finalReport.user_scenario}</p>
                          </div>
                          <div className="bg-black p-5 border border-zinc-900">
                            <h3 className="mono text-[10px] text-amber-500 font-bold uppercase mb-2 pb-2 border-b border-zinc-900">의도적 배제 & 기회비용</h3>
                            <p className="text-xs text-zinc-300 leading-relaxed">{state.finalReport.excluded_tradeoffs}</p>
                          </div>
                        </div>
                      )}

                      {/* 계산 기반 Design Brief */}
                      {state.grammarResult?.program_tree ? (() => {
                        const blocks = buildDesignBrief(state.grammarResult!);
                        const colorMap = {
                          emerald: { border: 'border-emerald-900/50', title: 'text-emerald-500', hl: 'text-emerald-400' },
                          indigo:  { border: 'border-indigo-900/50',  title: 'text-indigo-400',  hl: 'text-indigo-300' },
                          amber:   { border: 'border-amber-900/50',   title: 'text-amber-500',   hl: 'text-amber-300'  },
                          zinc:    { border: 'border-zinc-800',       title: 'text-zinc-400',    hl: 'text-zinc-200'   },
                        };
                        return blocks.map((block, bi) => {
                          const c = colorMap[block.color];
                          return (
                            <div key={bi} className={`bg-black p-5 border ${c.border}`}>
                              <h3 className={`mono text-[10px] font-bold uppercase mb-3 pb-2 border-b border-zinc-900 ${c.title}`}>
                                {block.title}
                              </h3>
                              <div className="space-y-3">
                                {block.rows.map((row, ri) => (
                                  row.value === '' && !row.sub ? (
                                    <div key={ri} className="mono text-[9px] text-zinc-600 uppercase pt-2">{row.label}</div>
                                  ) : (
                                    <div key={ri} className="flex flex-col gap-0.5">
                                      <div className="flex justify-between items-baseline gap-2">
                                        <span className={`text-xs ${row.highlight ? c.hl : 'text-zinc-400'}`}>{row.label}</span>
                                        {row.value && (
                                          <span className={`mono text-xs font-bold whitespace-nowrap ${row.highlight ? 'text-white' : 'text-zinc-300'}`}>
                                            {row.value}
                                          </span>
                                        )}
                                      </div>
                                      {row.sub && (
                                        <span className="text-[10px] text-zinc-600 leading-relaxed">{row.sub}</span>
                                      )}
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })() : (
                        <div className="flex flex-col items-center py-12 space-y-3">
                          <div className={`text-[9px] mono px-3 py-1 rounded-full font-bold border ${
                            state.ep1Status === 'loading' ? 'border-amber-500 text-amber-400 animate-pulse' :
                            state.ep1Status === 'error' ? 'border-red-500 text-red-400' :
                            'border-zinc-700 text-zinc-500'
                          }`}>
                            EP1 {state.ep1Status === 'loading' ? 'GENERATING...' : state.ep1Status.toUpperCase()}
                          </div>
                        </div>
                      )}

                      {/* JSON 내보내기 */}
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(state.grammarResult, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `blueprint_${state.projectName.replace(/\s+/g, '_')}.json`;
                            a.click();
                          }}
                          className="text-[10px] mono bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                        >
                          RAW JSON EXPORT ↓
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Floor Plan Generator ─────────────────────────────────── */}
        {state.grammarResult && (
          <div className="border border-zinc-800 bg-zinc-950 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-black">
              <div>
                <h2 className="mono text-[11px] text-emerald-500 font-bold uppercase tracking-widest">Floor Plan Generation</h2>
                <p className="text-[10px] text-zinc-600 mono mt-0.5">HouseDiffusion ML · 층별 평면 자동 생성</p>
              </div>
              <button
                onClick={handleGenerateFloorplan}
                disabled={floorplanLoading}
                className={`mono text-[10px] font-bold uppercase px-5 py-2 border transition-all ${
                  floorplanLoading
                    ? 'border-zinc-700 text-zinc-600 cursor-not-allowed'
                    : 'border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-black'
                }`}
              >
                {floorplanLoading ? '생성 중...' : 'GENERATE FLOOR PLANS'}
              </button>
            </div>

            {/* 로딩 */}
            {floorplanLoading && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <div className="mono text-xs text-zinc-500">ML 추론 중 — 층별 순서로 처리됩니다...</div>
                <div className="text-[10px] text-zinc-700 mono">GPU 사용 시 층당 약 30~60초 소요</div>
              </div>
            )}

            {/* 오류 */}
            {floorplanError && (
              <div className="p-6">
                <div className="bg-red-950/30 border border-red-900 p-4 text-xs text-red-400 mono">
                  <div className="font-bold mb-1">오류</div>
                  <div>{floorplanError}</div>
                  <div className="mt-2 text-red-600 text-[10px]">
                    → Anaconda Prompt에서 <span className="text-red-400">python server.py</span> 실행 확인
                  </div>
                </div>
              </div>
            )}

            {/* 결과 */}
            {floorplanResult && (
              <div className="p-6 space-y-6">
                <div className="flex gap-4 text-[10px] mono text-zinc-500">
                  <span>사이트: {floorplanResult.site_width_mm / 1000}m × {floorplanResult.site_depth_mm / 1000}m</span>
                  <span>·</span>
                  <span>층고: {floorplanResult.floor_to_floor_mm / 1000}m</span>
                  <span>·</span>
                  <span>{floorplanResult.floors.length}개 층 생성됨</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {floorplanResult.floors.map(f => (
                    <div key={f.floor} className="border border-zinc-800 bg-black">
                      <div className="px-3 py-1.5 border-b border-zinc-800 mono text-[9px] text-zinc-500 uppercase">
                        Floor {f.floor}
                      </div>
                      <img
                        src={`data:image/png;base64,${f.png_base64}`}
                        alt={`Floor ${f.floor}`}
                        className="w-full"
                      />
                      <div className="px-3 py-2 space-y-0.5">
                        {f.rooms.map(r => (
                          <div key={r.room_id} className="flex justify-between text-[9px] mono text-zinc-600">
                            <span className="truncate max-w-[100px]">{r.room_name}</span>
                            <span className="text-zinc-700">{r.area_m2?.toFixed(1)}m²</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(floorplanResult, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `floorplan_${state.projectName.replace(/\s+/g, '_')}.json`;
                      a.click();
                    }}
                    className="text-[10px] mono bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    FLOORPLAN JSON EXPORT ↓
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
                          <span className="mono text-emerald-500">{Math.round(p.area_target_mm2 / 1e6)} m²</span>
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
