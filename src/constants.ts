import { Checkpoint, ProjectState } from '@/types';

export const STORAGE_KEY = 'arch-decision-os-state';

export const CP_TO_PATH: Record<Checkpoint, string> = {
  [Checkpoint.DC1]: '/dc1',
  [Checkpoint.DC2]: '/dc2',
  [Checkpoint.DC5]: '/dc5',
  [Checkpoint.DC3]: '/dc3',
  [Checkpoint.DC4]: '/dc4',
  [Checkpoint.DC6]: '/dc6',
  [Checkpoint.DC7]: '/dc7',
};

export const PATH_TO_CP: Record<string, Checkpoint> = Object.fromEntries(
  Object.entries(CP_TO_PATH).map(([k, v]) => [v, k as Checkpoint])
);

export const defaultState: ProjectState = {
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
  grammarResult: null,
  ep1Status: 'idle',
  ep2Status: 'idle',
};

export function loadSavedState(): { state: ProjectState; isStarted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: defaultState, isStarted: false };
    const saved = JSON.parse(raw);
    if (!saved.isStarted) return { state: defaultState, isStarted: false };
    return {
      state: { ...defaultState, ...saved.state },
      isStarted: true,
    };
  } catch {
    return { state: defaultState, isStarted: false };
  }
}
