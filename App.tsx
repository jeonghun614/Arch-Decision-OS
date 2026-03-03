
import React, { useState, useEffect } from 'react';
import { Checkpoint, ProjectState, SelectionState, CHECKPOINT_ORDER, CHECKPOINT_LABELS, CHECKPOINT_LIMITS, VisualGuide, BlueprintJSON } from './types';
import { runKernel, generateFinalReport, generateVisualGuide, generateImagePrompt } from './services/geminiService';
import { compileGrammar } from './services/grammarCompiler';
import mappingData from './data/dc_to_grammar_mapping.json';

const App: React.FC = () => {
  const [state, setState] = useState<ProjectState>({
    projectName: "",
    projectDescription: "",
    siteInputs: {
      site_width_m: 30,
      site_depth_m: 40,
      coverage_ratio: 0.45,
      floors: 4,
      floor_to_floor_mm: 3300,
      efficiency_ratio: 0.75
    },
    currentCheckpoint: Checkpoint.DC1,
    selections: {
      dc1_id: null,
      dc2_type: null,
      dc5_types: [],
      dc3_ids: [],
      dc4_ids: [],
      dc6_ids: [],
      dc7_ids: []
    },
    logs: [],
    lastEngineOutput: null,
    completed: false,
    finalReport: null,
    grammarResult: null
  });

  const [isStarted, setIsStarted] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  
  // Visual Guide State
  const [visualGuide, setVisualGuide] = useState<VisualGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeGuideCheckpoint, setActiveGuideCheckpoint] = useState<Checkpoint | null>(null);
  const [activeSelection, setActiveSelection] = useState<{id: string|string[], label: string|string[]} | null>(null);

  // Prompt Gen State
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

  // Results Tab State
  const [activeTab, setActiveTab] = useState<'grammar' | 'programs' | 'json'>('grammar');

  // Temporary selection state for the current step (before confirming)
  const [currentSelections, setCurrentSelections] = useState<string[]>([]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        // Fallback for environments without aistudio global
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  const handleOpenSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  useEffect(() => {
    if (isStarted && !state.completed && !state.lastEngineOutput) {
      triggerKernel();
    }
  }, [isStarted, state.currentCheckpoint]);

  useEffect(() => {
    // Reset temporary selections when stage changes
    setCurrentSelections([]);
    if (isStarted && !state.completed && state.lastEngineOutput?.current_stage !== state.currentCheckpoint) {
        triggerKernel();
    }
  }, [state.currentCheckpoint]);

  // Trigger final report generation when completed
  useEffect(() => {
    if (state.completed && !state.finalReport && !generatingReport) {
        generateReport();
    }
  }, [state.completed, state.finalReport]);

  const triggerKernel = async () => {
    setLoading(true);
    try {
      const response = await runKernel(
        state.currentCheckpoint, 
        state.selections, 
        state.logs,
        { name: state.projectName, description: state.projectDescription }
      );
      setState(prev => ({ ...prev, lastEngineOutput: response }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
      setGeneratingReport(true);
      try {
          const report = await generateFinalReport(state.logs, { name: state.projectName, description: state.projectDescription });
          
          // Compile grammar once report is ready
          const grammarResult = compileGrammar(state.siteInputs, state.logs, report.core_logic + " " + report.causality);
          
          setState(prev => ({ 
            ...prev, 
            finalReport: report,
            grammarResult: grammarResult
          }));
      } catch (e) {
          console.error(e);
      } finally {
          setGeneratingReport(false);
      }
  };

  const handleGenerateVisualGuide = async (checkpoint: Checkpoint, id: string | string[], label: string | string[]) => {
      setGuideLoading(true);
      setActiveGuideCheckpoint(checkpoint);
      setActiveSelection({ id, label });
      setShowGuideModal(true);
      setVisualGuide(null); // Clear previous
      setGeneratedPrompt(null); // Clear previous prompt

      try {
          const guide = await generateVisualGuide(
              checkpoint, 
              { id, label }, 
              { name: state.projectName, description: state.projectDescription }
          );
          setVisualGuide(guide);
      } catch (e) {
          console.error(e);
      } finally {
          setGuideLoading(false);
      }
  };

  const handleGeneratePrompt = async () => {
      if (!activeGuideCheckpoint || !activeSelection) return;
      
      setIsGeneratingPrompt(true);
      try {
          const prompt = await generateImagePrompt(
              activeGuideCheckpoint,
              activeSelection,
              { name: state.projectName, description: state.projectDescription },
              visualGuide || undefined
          );
          setGeneratedPrompt(prompt);
      } catch (e) {
          console.error(e);
          alert("Prompt generation failed.");
      } finally {
          setIsGeneratingPrompt(false);
      }
  };

  const copyToClipboard = () => {
      if (generatedPrompt) {
          navigator.clipboard.writeText(generatedPrompt);
          alert("Prompt copied to clipboard!");
      }
  };

  const handleToggleOption = (id: string) => {
    const limit = CHECKPOINT_LIMITS[state.currentCheckpoint];
    
    setCurrentSelections(prev => {
      const isSelected = prev.includes(id);
      if (isSelected) {
        return prev.filter(item => item !== id);
      } else {
        if (prev.length >= limit) {
           // If single select, replace. If multi, block adding or replace first?
           // For UX: Single select -> Replace. Multi select -> Don't add, or replace oldest? 
           // Let's behave strictly: if full, do nothing (user must deselect) OR replace for single.
           if (limit === 1) return [id];
           return prev; // Hit limit, ignore
        }
        return [...prev, id];
      }
    });
  };

  const handleConfirmDecision = () => {
    if (currentSelections.length === 0) return;
    
    // Determine next checkpoint
    const currentIndex = CHECKPOINT_ORDER.indexOf(state.currentCheckpoint);
    const nextCheckpoint = CHECKPOINT_ORDER[currentIndex + 1];
    const isFinished = currentIndex === CHECKPOINT_ORDER.length - 1;
    
    // Find labels for logging
    const options = state.lastEngineOutput?.available_options || [];
    const selectedLabels = currentSelections.map(id => options.find(o => o.id === id)?.label || id);

    // Update selection map
    const newSelections = { ...state.selections };
    if (state.currentCheckpoint === Checkpoint.DC1) newSelections.dc1_id = currentSelections[0];
    if (state.currentCheckpoint === Checkpoint.DC2) newSelections.dc2_type = currentSelections[0];
    if (state.currentCheckpoint === Checkpoint.DC5) newSelections.dc5_types = [...currentSelections];
    if (state.currentCheckpoint === Checkpoint.DC3) newSelections.dc3_ids = [...currentSelections];
    if (state.currentCheckpoint === Checkpoint.DC4) newSelections.dc4_ids = [...currentSelections];
    if (state.currentCheckpoint === Checkpoint.DC6) newSelections.dc6_ids = [...currentSelections];
    if (state.currentCheckpoint === Checkpoint.DC7) newSelections.dc7_ids = [...currentSelections];

    const newLogs = [
      ...state.logs,
      {
        checkpoint: state.currentCheckpoint,
        selectedId: currentSelections.length === 1 ? currentSelections[0] : currentSelections,
        selectedLabel: selectedLabels.length === 1 ? selectedLabels[0] : selectedLabels,
        timestamp: Date.now()
      }
    ];

    setState(prev => ({
      ...prev,
      selections: newSelections,
      logs: newLogs,
      currentCheckpoint: isFinished ? prev.currentCheckpoint : nextCheckpoint,
      completed: isFinished,
      lastEngineOutput: null // Clear to trigger refresh
    }));
  };

  const handleRestart = () => {
      window.location.reload();
  };

  if (!isStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505] text-zinc-300">
        <div className="max-w-xl w-full border border-zinc-800 p-12 bg-black">
          <h1 className="text-4xl font-bold mb-2 mono tracking-tighter text-white">ARCH-DECISION</h1>
          <h2 className="text-lg text-emerald-600 mono mb-8">ADSS_KERNEL_v4.2</h2>
          <p className="text-zinc-500 mb-8 text-sm leading-relaxed">
            Architectural Decision Support System.<br/>
            프로젝트 맥락을 기반으로 AI가 최적의 결정을 제안하고, 논리적 충돌을 검증합니다.
          </p>
          <div className="space-y-4">
            <div>
                <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Project Name</label>
                <input 
                    type="text" 
                    className="w-full bg-zinc-900 border border-zinc-800 p-4 text-white font-bold mono focus:border-emerald-600 outline-none placeholder:text-zinc-700"
                    placeholder="e.g., SEOUL MEDI-CENTER"
                    value={state.projectName}
                    onChange={(e) => setState(p => ({ ...p, projectName: e.target.value }))}
                />
            </div>
            <div>
                <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Project Brief / Description</label>
                <textarea 
                    className="w-full bg-zinc-900 border border-zinc-800 p-4 text-sm text-zinc-300 focus:border-emerald-600 outline-none h-32 resize-none placeholder:text-zinc-700"
                    placeholder="프로젝트의 주요 목표, 대지 상황, 프로그램 구성 등을 입력하면 AI가 적합한 초기 전략을 추천합니다."
                    value={state.projectDescription}
                    onChange={(e) => setState(p => ({ ...p, projectDescription: e.target.value }))}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Site Width (m)</label>
                    <input 
                        type="number" 
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.site_width_m}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, site_width_m: Number(e.target.value) } }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Site Depth (m)</label>
                    <input 
                        type="number" 
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.site_depth_m}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, site_depth_m: Number(e.target.value) } }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Coverage Ratio (0~1)</label>
                    <input 
                        type="number" 
                        step="0.01"
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.coverage_ratio}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, coverage_ratio: Number(e.target.value) } }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Floors</label>
                    <input 
                        type="number" 
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.floors}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, floors: Number(e.target.value) } }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Floor to Floor (mm)</label>
                    <input 
                        type="number" 
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.floor_to_floor_mm}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, floor_to_floor_mm: Number(e.target.value) } }))}
                    />
                </div>
                <div>
                    <label className="block text-[10px] mono text-zinc-600 mb-1 uppercase font-bold">Efficiency Ratio (0~1)</label>
                    <input 
                        type="number" 
                        step="0.01"
                        className="w-full bg-zinc-900 border border-zinc-800 p-3 text-sm text-white mono focus:border-emerald-600 outline-none"
                        value={state.siteInputs.efficiency_ratio}
                        onChange={(e) => setState(p => ({ ...p, siteInputs: { ...p.siteInputs, efficiency_ratio: Number(e.target.value) } }))}
                    />
                </div>
            </div>
            <button 
                onClick={() => state.projectName && setIsStarted(true)}
                disabled={!state.projectName}
                className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 text-white font-bold py-4 mono uppercase transition-all mt-4"
            >
                INITIALIZE SYSTEM
            </button>
          </div>
          
          {!hasApiKey && (
            <div className="mt-8 p-4 border border-indigo-900/50 bg-indigo-950/20 rounded-sm">
              <p className="text-xs text-indigo-300 mb-3 mono">
                Gemini 3 모델을 사용하기 위해 API 키 선택이 필요합니다.
                <br/>
                <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline">유료 프로젝트</a>의 키를 선택해주세요.
              </p>
              <button 
                onClick={handleOpenSelectKey}
                className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] mono font-bold uppercase transition-all"
              >
                SELECT API KEY
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.completed) {
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
                                                    {state.grammarResult.blueprint.programs.map(p => (
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
                                                    {state.grammarResult.blueprint.relations.edges.map((e, i) => (
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
                                                    {state.grammarResult.blueprint.allocation.floor_assignment.map(f => (
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
                                            { label: "Topology", value: state.grammarResult.grammar.spatial_grammar_spec.topology.type },
                                            { label: "Centrality", value: state.grammarResult.grammar.spatial_grammar_spec.centrality.type },
                                            { label: "Buffer", value: state.grammarResult.grammar.spatial_grammar_spec.buffer.strategy },
                                            { label: "Circulation", value: state.grammarResult.grammar.spatial_grammar_spec.circulation.type }
                                        ].map((item, i) => (
                                            <div key={i} className="bg-zinc-900/50 p-3 border border-zinc-800">
                                                <div className="text-[8px] mono text-zinc-600 mb-1 uppercase">{item.label}</div>
                                                <div className="text-xs font-bold text-white truncate">{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="mono text-[9px] text-zinc-500 uppercase">Grammar Rules</h4>
                                        {state.grammarResult.grammar.rules.map((rule, i) => (
                                            <div key={i} className="bg-zinc-900 p-3 border-l border-indigo-500 text-[10px] text-zinc-400 font-mono leading-relaxed">
                                                {rule}
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
  }

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

      {/* 
          Updated Padding:
          Using `px-6 pt-6` and `md:px-12 md:pt-12` separates specific padding from `pb-`.
          `pb-40` ensures the bottom content is not hidden behind the fixed footer.
      */}
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
                                            ⚠️ {opt.warning_reason}
                                        </div>
                                    )}
                                </button>
                            )})}
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
            <div className="text-xs text-zinc-500">
                {currentSelections.length} / {maxLimit} SELECTED
                {state.currentCheckpoint === Checkpoint.DC5 && currentSelections.length === 2 && " (Dual Axis Enabled)"}
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

export default App;
