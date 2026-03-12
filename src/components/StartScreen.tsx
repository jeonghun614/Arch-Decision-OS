import React from 'react';
import { AppContext } from '../hooks/useProjectState';

interface Props {
  ctx: AppContext;
}

const StartScreen: React.FC<Props> = ({ ctx }) => {
  const { state, setState, hasApiKey, handleOpenSelectKey, handleStart } = ctx;

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
            onClick={handleStart}
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
};

export default StartScreen;
