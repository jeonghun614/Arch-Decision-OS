import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Checkpoint, ProjectState, VisualGuide, CHECKPOINT_ORDER, CHECKPOINT_LIMITS } from '@/types';
import { runKernel, generateFinalReport, generateVisualGuide as generateVisualGuideApi, generateImagePrompt } from '@/services/geminiService';
import { runEP1ProgramTree } from '@/services/ep1Service';
import { runEP2Pipeline } from '@/services/ep2Runner';
import { compileGrammar } from '@/services/grammarCompiler';
import { STORAGE_KEY, CP_TO_PATH, PATH_TO_CP, loadSavedState, defaultState } from '../constants';

export function useProjectState() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<ProjectState>(() => loadSavedState().state);
  const [isStarted, setIsStarted] = useState(() => loadSavedState().isStarted);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [visualGuide, setVisualGuide] = useState<VisualGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeGuideCheckpoint, setActiveGuideCheckpoint] = useState<Checkpoint | null>(null);
  const [activeSelection, setActiveSelection] = useState<{ id: string | string[]; label: string | string[] } | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const kernelRunningRef = useRef(false);

  const [activeTab, setActiveTab] = useState<'grammar' | 'programs' | 'json'>('grammar');
  const [currentSelections, setCurrentSelections] = useState<string[]>([]);

  // localStorage 자동 저장 (결정 진행 중일 때만)
  useEffect(() => {
    try {
      if (isStarted) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, isStarted }));
      }
    } catch {}
  }, [state, isStarted]);

  // URL → 체크포인트 동기화
  useEffect(() => {
    const cp = PATH_TO_CP[location.pathname];
    if (cp && isStarted && cp !== state.currentCheckpoint) {
      setState(prev => ({ ...prev, currentCheckpoint: cp, lastEngineOutput: null }));
    }
    if (location.pathname === '/' && isStarted) {
      setIsStarted(false);
      setState(defaultState);
    }
    if (location.pathname === '/result' && !state.completed) {
      if (isStarted) navigate(CP_TO_PATH[state.currentCheckpoint], { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
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

  const triggerKernel = async () => {
    if (kernelRunningRef.current) return;
    kernelRunningRef.current = true;
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
      kernelRunningRef.current = false;
    }
  };

  useEffect(() => {
    if (isStarted && !state.completed && !state.lastEngineOutput) {
      triggerKernel();
    }
  }, [isStarted, state.currentCheckpoint]);

  useEffect(() => {
    setCurrentSelections([]);
    if (isStarted && !state.completed && state.lastEngineOutput?.current_stage !== state.currentCheckpoint) {
      triggerKernel();
    }
  }, [state.currentCheckpoint]);

  useEffect(() => {
    if (state.completed && !state.finalReport && !generatingReport) {
      generateReport();
    }
  }, [state.completed, state.finalReport]);

  const generateReport = async () => {
    setGeneratingReport(true);
    try {
      const report = await generateFinalReport(state.logs, { name: state.projectName, description: state.projectDescription });
      const grammarResult = compileGrammar(state.siteInputs, state.logs, report.core_logic + " " + report.causality);

      setState(prev => ({
        ...prev,
        finalReport: report,
        grammarResult: grammarResult,
        ep1Status: 'loading',
      }));

      let apiKey = '';
      if (window.aistudio) {
        apiKey = await (window.aistudio as any).getApiKey?.() ?? '';
      }
      if (!apiKey) apiKey = (import.meta as any).env?.VITE_API_KEY ?? process.env.API_KEY ?? '';

      const programTree = await runEP1ProgramTree(grammarResult, apiKey);

      setState(prev => ({
        ...prev,
        ep1Status: 'done',
        ep2Status: 'loading',
        grammarResult: prev.grammarResult
          ? { ...prev.grammarResult, program_tree: programTree }
          : prev.grammarResult,
      }));

      const ep2Output = runEP2Pipeline(programTree, grammarResult);

      setState(prev => ({
        ...prev,
        ep2Status: 'done',
        grammarResult: prev.grammarResult
          ? { ...prev.grammarResult, ep2: ep2Output }
          : prev.grammarResult,
      }));
    } catch (e) {
      console.error(e);
      setState(prev => ({
        ...prev,
        ep1Status: prev.ep1Status === 'loading' ? 'error' : prev.ep1Status,
        ep2Status: prev.ep2Status === 'loading' ? 'error' : prev.ep2Status,
      }));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleGenerateVisualGuide = async (checkpoint: Checkpoint, id: string | string[], label: string | string[]) => {
    setGuideLoading(true);
    setActiveGuideCheckpoint(checkpoint);
    setActiveSelection({ id, label });
    setShowGuideModal(true);
    setVisualGuide(null);
    setGeneratedPrompt(null);
    try {
      const guide = await generateVisualGuideApi(
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
          if (limit === 1) return [id];
          return prev;
        }
        return [...prev, id];
      }
    });
  };

  const handleConfirmDecision = () => {
    if (currentSelections.length === 0) return;

    const currentIndex = CHECKPOINT_ORDER.indexOf(state.currentCheckpoint);
    const nextCheckpoint = CHECKPOINT_ORDER[currentIndex + 1];
    const isFinished = currentIndex === CHECKPOINT_ORDER.length - 1;

    const options = state.lastEngineOutput?.available_options || [];
    const selectedLabels = currentSelections.map(id => options.find(o => o.id === id)?.label || id);

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
      lastEngineOutput: null
    }));

    if (isFinished) {
      navigate('/result');
    } else {
      navigate(CP_TO_PATH[nextCheckpoint]);
    }
  };

  const handleRestart = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.href = '/';
  };

  const handleGoBack = () => {
    const currentIndex = CHECKPOINT_ORDER.indexOf(state.currentCheckpoint);
    if (currentIndex <= 0) return;
    const prevCheckpoint = CHECKPOINT_ORDER[currentIndex - 1];
    const newLogs = state.logs.filter(l => l.checkpoint !== prevCheckpoint);
    const newSelections = { ...state.selections };
    if (prevCheckpoint === Checkpoint.DC1) newSelections.dc1_id = null;
    if (prevCheckpoint === Checkpoint.DC2) newSelections.dc2_type = null;
    if (prevCheckpoint === Checkpoint.DC5) newSelections.dc5_types = [];
    if (prevCheckpoint === Checkpoint.DC3) newSelections.dc3_ids = [];
    if (prevCheckpoint === Checkpoint.DC4) newSelections.dc4_ids = [];
    if (prevCheckpoint === Checkpoint.DC6) newSelections.dc6_ids = [];
    if (prevCheckpoint === Checkpoint.DC7) newSelections.dc7_ids = [];
    setState(prev => ({
      ...prev,
      currentCheckpoint: prevCheckpoint,
      selections: newSelections,
      logs: newLogs,
      lastEngineOutput: null,
      completed: false,
    }));
    setCurrentSelections([]);
    navigate(CP_TO_PATH[prevCheckpoint]);
  };

  const handleStart = () => {
    setIsStarted(true);
    navigate('/dc1');
    triggerKernel();
  };

  return {
    state,
    setState,
    isStarted,
    setIsStarted,
    hasApiKey,
    loading,
    generatingReport,
    visualGuide,
    guideLoading,
    showGuideModal,
    setShowGuideModal,
    activeGuideCheckpoint,
    activeSelection,
    generatedPrompt,
    isGeneratingPrompt,
    activeTab,
    setActiveTab,
    currentSelections,
    location,
    handleOpenSelectKey,
    triggerKernel,
    handleGenerateVisualGuide,
    handleGeneratePrompt,
    copyToClipboard,
    handleToggleOption,
    handleConfirmDecision,
    handleRestart,
    handleGoBack,
    handleStart,
  };
}

export type AppContext = ReturnType<typeof useProjectState>;
