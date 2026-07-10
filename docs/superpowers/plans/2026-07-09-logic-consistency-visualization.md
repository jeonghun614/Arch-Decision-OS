# 논리 일관성 가시화 (Logic Consistency Visualization) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결정 로그를 순수 함수로 리플레이해 (1) DecisionView에 9축 누적 프로파일 스트립(옵션 hover 미리보기 포함), (2) ResultPage에 결정 체인 SVG 다이어그램(선택→차단 인과)을 추가한다.

**Architecture:** 새 순수 모듈 2개(`services/axisProfile.ts`, `services/decisionChain.ts`)가 기존 `DecisionLog[]`와 정적 데이터(`DC_LIBRARY`/`LOGIC_RULES`)만으로 모든 시각화 데이터를 파생한다. 저장 상태·localStorage 포맷·logicEngine·Gemini 호출은 변경하지 않는다. UI는 신규 컴포넌트 2개를 기존 페이지에 삽입한다.

**Tech Stack:** React 19 + TypeScript + Vite 6. 테스트는 vitest(신규 devDependency). 스타일은 Tailwind CDN 클래스(런타임 JIT — 임의 클래스 사용 가능) + `.mono` 클래스(JetBrains Mono).

**Spec:** `docs/superpowers/specs/2026-07-09-logic-consistency-visualization-design.md`

## Global Constraints

- 런타임 의존성 추가 금지. devDependency는 `vitest`만 저장소에 추가 (검증용 playwright는 scratchpad에만 설치, 저장소 밖).
- `ProjectState`·localStorage 포맷·`services/logicEngine.ts`·`services/geminiService.ts` 동작 변경 금지.
- 모든 커밋 직전에 `npm run lint` (= `tsc --noEmit`) 통과 필수.
- import alias: `@/*` = 저장소 루트 (vite.config.ts와 tsconfig.json 모두 설정됨). `services/` 내부 파일끼리는 기존 관례대로 상대 경로 사용.
- 스타일: 기존 다크 디자인 언어 유지 — zinc 배경, emerald(긍정)/amber(경고)/red(부정)/indigo(AI·신규), 라벨은 `mono text-[10px] uppercase tracking-widest`.
- git 커밋 정체성: 저장소 로컬 config가 `user.name Claude` / `user.email noreply@anthropic.com`로 설정되어 있어야 한다 (아니면 `git config user.email noreply@anthropic.com && git config user.name Claude` 먼저 실행). 커밋 메시지 마지막에 다음 트레일러 2줄을 넣는다:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV
  ```
- 작업 브랜치: `claude/architecture-design-os-dev-4meg98` (기존 브랜치, push는 `git push -u origin claude/architecture-design-os-dev-4meg98`).

## 도메인 배경 (구현자용 90초 요약)

이 앱은 건축 설계 학생용 의사결정 도구다. 학생은 7개 체크포인트를 순서대로 결정한다:
`DC1(문제정의) → DC2(공간태도) → DC5(동선) → DC3(운영) → DC4(매스) → DC6(구조) → DC7(표현)`
(순서는 `types.ts`의 `CHECKPOINT_ORDER`).

모든 선택지는 9개 축(`AxisName`: Exposure, Encounter, Access, Sharing, Temporal, Separation, Centrality, Mass, Expression)에 값을 갖는다. DC1 옵션은 `bias_axis_pref`(선호 축값)와 `anti_axis_forbid`(금지 축값)를, DC2~DC7 옵션은 `engine_axes`(주장 축값)를 가진다. `services/logicEngine.ts`의 `calculateAvailableOptions(checkpoint, selections)`는 **순수 함수**로, 현재까지의 선택으로부터 허용(allowed: status `allowed`|`warning`)/차단(blocked: `blocked_by[]` + `reason`) 목록을 계산한다. 이 순수성 덕분에 결정 로그를 리플레이하면 각 단계의 차단 상태를 재구성할 수 있다 — 이것이 이 계획 전체의 토대다.

선택 이력은 `DecisionLog[]`로 저장된다 (`types.ts:72`):
```ts
interface DecisionLog {
  checkpoint: Checkpoint;
  selectedId: string | string[];    // 단일 또는 복수 선택
  selectedLabel: string | string[];
  timestamp: number;
}
```

---

### Task 1: vitest 설정 + `computeAxisProfile` (누적 축 프로파일)

**Files:**
- Modify: `package.json` (vitest devDependency + `test` 스크립트)
- Create: `services/axisProfile.ts`
- Test: `services/axisProfile.test.ts`

**Interfaces:**
- Consumes: `types.ts`의 `Checkpoint`, `CHECKPOINT_ORDER`, `AxisName`, `DecisionLog`; `data/staticData.ts`의 `DC_LIBRARY`, `LOGIC_RULES`
- Produces (Task 2·4가 사용):
  - `type AxisJudgement = 'match' | 'weak' | 'conflict' | 'forbidden' | 'new'`
  - `interface AxisClaim { checkpoint: Checkpoint; optionId: string; optionLabel: string; value: string }`
  - `interface AxisStance { axis: AxisName; claims: AxisClaim[]; current: string | null; preferred: string | null; forbidden: string | null; conflict: boolean }`
  - `function computeAxisProfile(logs: DecisionLog[]): AxisStance[]` — 항상 9개 축 전부 반환
  - 내부 헬퍼 `findOption`, `isWeakPair`는 Task 2에서도 쓰이므로 같은 파일에 둔다 (export 불필요)

- [ ] **Step 1: vitest 설치 및 test 스크립트 등록**

```bash
cd /home/user/Arch-Decision-OS
npm install -D vitest
# vite.config.ts의 define이 GEMINI_API_KEY를 참조하므로, 키 부재로
# vitest 기동이 실패하지 않도록 더미 키를 보장한다 (.env.local은 gitignored)
[ -f .env.local ] || echo 'GEMINI_API_KEY=dummy-key-for-ui-verification' > .env.local
```

`package.json`의 `scripts`에 추가 (기존 lint 스크립트 뒤):

```json
    "preview": "vite preview",
    "test": "vitest run",
    "lint": "tsc --noEmit"
```

(정확한 결과: `scripts`가 `dev`, `build`, `preview`, `test`, `lint` 5개.)

- [ ] **Step 2: 실패하는 테스트 작성**

`services/axisProfile.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { Checkpoint, DecisionLog } from '../types';
import { computeAxisProfile } from './axisProfile';

const log = (checkpoint: Checkpoint, id: string | string[]): DecisionLog => ({
  checkpoint,
  selectedId: id,
  selectedLabel: id,
  timestamp: 0,
});

describe('computeAxisProfile', () => {
  it('빈 로그: 9개 축 전부 미정 상태를 반환한다', () => {
    const profile = computeAxisProfile([]);
    expect(profile).toHaveLength(9);
    for (const stance of profile) {
      expect(stance.claims).toEqual([]);
      expect(stance.current).toBeNull();
      expect(stance.preferred).toBeNull();
      expect(stance.forbidden).toBeNull();
      expect(stance.conflict).toBe(false);
    }
  });

  it('DC1만: bias/anti가 preferred/forbidden으로 반영되고 claims는 비어 있다', () => {
    // DC1-01: bias { Exposure: LOW, Separation: SEPARATED },
    //         anti { Encounter: FORCED, Sharing: MANDATORY }
    const profile = computeAxisProfile([log(Checkpoint.DC1, 'DC1-01')]);
    const by = new Map(profile.map(s => [s.axis, s]));
    expect(by.get('Exposure')!.preferred).toBe('LOW');
    expect(by.get('Separation')!.preferred).toBe('SEPARATED');
    expect(by.get('Encounter')!.forbidden).toBe('FORCED');
    expect(by.get('Sharing')!.forbidden).toBe('MANDATORY');
    expect(by.get('Exposure')!.claims).toEqual([]);
    expect(by.get('Exposure')!.current).toBeNull();
  });

  it('DC2 선택: engine_axes가 claims/current로 쌓인다', () => {
    // DC2.D engine_axes에 Exposure: LOW, Expression: SILENT 포함
    const profile = computeAxisProfile([
      log(Checkpoint.DC1, 'DC1-01'),
      log(Checkpoint.DC2, 'DC2.D'),
    ]);
    const exposure = profile.find(s => s.axis === 'Exposure')!;
    expect(exposure.current).toBe('LOW');
    expect(exposure.claims).toHaveLength(1);
    expect(exposure.claims[0]).toMatchObject({
      checkpoint: Checkpoint.DC2,
      optionId: 'DC2.D',
      value: 'LOW',
    });
    expect(exposure.conflict).toBe(false);
  });

  it('비호환 주장 쌍이 있으면 conflict, current는 가장 최근 주장', () => {
    // DC2.D: Expression SILENT / DC7-02: Expression EXPRESSIVE
    // (SILENT-EXPRESSIVE는 weak pair가 아님 → 충돌)
    const profile = computeAxisProfile([
      log(Checkpoint.DC2, 'DC2.D'),
      log(Checkpoint.DC7, ['DC7-02']),
    ]);
    const expr = profile.find(s => s.axis === 'Expression')!;
    expect(expr.conflict).toBe(true);
    expect(expr.current).toBe('EXPRESSIVE');
  });

  it('weak pair로 연결되는 상이한 값은 conflict가 아니다', () => {
    // DC2.C: Exposure LOW / DC3-01: Exposure MID — [LOW, MID]는 weak pair
    const profile = computeAxisProfile([
      log(Checkpoint.DC2, 'DC2.C'),
      log(Checkpoint.DC3, ['DC3-01']),
    ]);
    const exposure = profile.find(s => s.axis === 'Exposure')!;
    expect(exposure.conflict).toBe(false);
    expect(exposure.current).toBe('MID');
  });

  it('알 수 없는 옵션 id는 무시하고 throw하지 않는다', () => {
    const profile = computeAxisProfile([
      log(Checkpoint.DC1, 'ZZZ-99'),
      log(Checkpoint.DC3, ['GONE-1']),
    ]);
    expect(profile).toHaveLength(9);
    for (const stance of profile) {
      expect(stance.claims).toEqual([]);
      expect(stance.preferred).toBeNull();
    }
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `npx vitest run services/axisProfile.test.ts`
Expected: FAIL — `Cannot find module './axisProfile'` (또는 동등한 resolve 에러)

- [ ] **Step 4: 최소 구현 작성**

`services/axisProfile.ts` 생성:

```ts
import { DC_LIBRARY, LOGIC_RULES } from "../data/staticData";
import { Checkpoint, CHECKPOINT_ORDER, AxisName, DecisionLog } from "../types";

export type AxisJudgement = 'match' | 'weak' | 'conflict' | 'forbidden' | 'new';

export interface AxisClaim {
  checkpoint: Checkpoint;
  optionId: string;
  optionLabel: string;
  value: string;
}

export interface AxisStance {
  axis: AxisName;
  claims: AxisClaim[];
  current: string | null;    // 가장 최근 주장 값
  preferred: string | null;  // DC1 bias_axis_pref
  forbidden: string | null;  // DC1 anti_axis_forbid
  conflict: boolean;         // claims 안에 비호환 값 쌍 존재
}

const ALL_AXES: AxisName[] = [
  "Exposure", "Encounter", "Access", "Sharing", "Temporal",
  "Separation", "Centrality", "Mass", "Expression",
];

// DC2/DC5는 라이브러리에서 'type' 필드가 id 역할 (geminiService.getOptionDetails와 동일 규칙)
function findOption(checkpoint: Checkpoint, id: string): any | null {
  const lists: Record<Checkpoint, any[]> = {
    [Checkpoint.DC1]: DC_LIBRARY.dc1_options,
    [Checkpoint.DC2]: DC_LIBRARY.dc2_types,
    [Checkpoint.DC5]: DC_LIBRARY.dc5_types,
    [Checkpoint.DC3]: DC_LIBRARY.dc3_options,
    [Checkpoint.DC4]: DC_LIBRARY.dc4_options,
    [Checkpoint.DC6]: DC_LIBRARY.dc6_options,
    [Checkpoint.DC7]: DC_LIBRARY.dc7_options,
  };
  return lists[checkpoint].find((o: any) => o.id === id || o.type === id) ?? null;
}

function isWeakPair(axis: string, a: string, b: string): boolean {
  const pairs = LOGIC_RULES.execution_spec.weak_match_pairs.find(p => p.axis === axis)?.pairs;
  if (!pairs) return false;
  return pairs.some(pair => pair.includes(a) && pair.includes(b));
}

export function computeAxisProfile(logs: DecisionLog[]): AxisStance[] {
  const ordered = [...logs].sort(
    (a, b) => CHECKPOINT_ORDER.indexOf(a.checkpoint) - CHECKPOINT_ORDER.indexOf(b.checkpoint)
  );

  const claimsByAxis = new Map<AxisName, AxisClaim[]>();
  let preferred: Partial<Record<AxisName, string>> = {};
  let forbidden: Partial<Record<AxisName, string>> = {};

  for (const entry of ordered) {
    const ids = Array.isArray(entry.selectedId) ? entry.selectedId : [entry.selectedId];
    for (const id of ids) {
      const opt = findOption(entry.checkpoint, id);
      if (!opt) continue; // 옛 localStorage의 미지 id: 판정에서 제외 (스펙 §4)
      if (entry.checkpoint === Checkpoint.DC1) {
        preferred = { ...(opt.bias_axis_pref ?? {}) };
        forbidden = { ...(opt.anti_axis_forbid ?? {}) };
        continue;
      }
      for (const [axis, value] of Object.entries(opt.engine_axes ?? {})) {
        const list = claimsByAxis.get(axis as AxisName) ?? [];
        list.push({ checkpoint: entry.checkpoint, optionId: id, optionLabel: opt.label, value: value as string });
        claimsByAxis.set(axis as AxisName, list);
      }
    }
  }

  return ALL_AXES.map(axis => {
    const claims = claimsByAxis.get(axis) ?? [];
    const current = claims.length ? claims[claims.length - 1].value : null;
    let conflict = false;
    outer: for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const a = claims[i].value, b = claims[j].value;
        if (a !== b && !isWeakPair(axis, a, b)) { conflict = true; break outer; }
      }
    }
    return {
      axis,
      claims,
      current,
      preferred: preferred[axis] ?? null,
      forbidden: forbidden[axis] ?? null,
      conflict,
    };
  });
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run services/axisProfile.test.ts`
Expected: PASS — 6 tests passed

- [ ] **Step 6: lint 확인 후 커밋**

```bash
npm run lint
git add package.json package-lock.json services/axisProfile.ts services/axisProfile.test.ts
git commit -m "feat: add axis profile derivation from decision logs

9-axis accumulated stance (claims, DC1 preference/forbid, conflict
detection via weak-match pairs) computed purely from DecisionLog replay.
Adds vitest as the test runner.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 2: `previewOption` (옵션별 축 정합 미리보기)

**Files:**
- Modify: `services/axisProfile.ts` (함수 1개 추가)
- Test: `services/axisProfile.test.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 1의 `AxisStance`, `AxisJudgement`, `findOption`, `isWeakPair`
- Produces (Task 4가 사용):
  - `function previewOption(profile: AxisStance[], checkpoint: Checkpoint, optionId: string): Partial<Record<AxisName, AxisJudgement>>`

**판정 규칙 (스펙 §3.2):** 축별 기준값 = `current ?? preferred`.
1. 옵션 값 == `forbidden` → `'forbidden'`
2. 기준값 없음 → `'new'`
3. 옵션 값 == 기준값 → `'match'`
4. weak pair로 연결 → `'weak'`
5. 그 외 → `'conflict'`

DC1 옵션은 `engine_axes`가 없으므로 `bias_axis_pref`를 주장 값으로 사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`services/axisProfile.test.ts` 하단에 추가:

```ts
import { previewOption } from './axisProfile';
// (기존 import 문에 previewOption을 합쳐도 된다:
//  import { computeAxisProfile, previewOption } from './axisProfile';)

describe('previewOption', () => {
  it('DC1-01 이후 DC2.E: forbidden/conflict/new가 판정된다', () => {
    const profile = computeAxisProfile([log(Checkpoint.DC1, 'DC1-01')]);
    const p = previewOption(profile, Checkpoint.DC2, 'DC2.E');
    // DC2.E: Sharing MANDATORY == DC1-01 forbidden → forbidden
    expect(p.Sharing).toBe('forbidden');
    // Exposure HIGH vs preferred LOW (weak pair 아님) → conflict
    expect(p.Exposure).toBe('conflict');
    // Separation INTEGRATED vs preferred SEPARATED (weak pair 아님) → conflict
    expect(p.Separation).toBe('conflict');
    // Encounter OPTIONAL: current/preferred 없음(DC1-01 pref에 Encounter 없음) → new
    expect(p.Encounter).toBe('new');
  });

  it('DC1-01 이후 DC2.A: preferred와 일치하면 match (claims 없어도)', () => {
    const profile = computeAxisProfile([log(Checkpoint.DC1, 'DC1-01')]);
    const p = previewOption(profile, Checkpoint.DC2, 'DC2.A');
    expect(p.Exposure).toBe('match');     // LOW == preferred LOW
    expect(p.Separation).toBe('match');   // SEPARATED == preferred SEPARATED
  });

  it('DC1-01 이후 DC2.B: weak pair 판정', () => {
    const profile = computeAxisProfile([log(Checkpoint.DC1, 'DC1-01')]);
    const p = previewOption(profile, Checkpoint.DC2, 'DC2.B');
    expect(p.Exposure).toBe('weak');      // MID vs LOW
    expect(p.Separation).toBe('weak');    // BUFFERED vs SEPARATED
  });

  it('빈 프로파일에서 DC1 옵션 미리보기: bias_axis_pref가 new로 표시된다', () => {
    const profile = computeAxisProfile([]);
    const p = previewOption(profile, Checkpoint.DC1, 'DC1-01');
    expect(p.Exposure).toBe('new');
    expect(p.Separation).toBe('new');
  });

  it('알 수 없는 옵션 id는 빈 객체를 반환한다', () => {
    const profile = computeAxisProfile([]);
    expect(previewOption(profile, Checkpoint.DC2, 'NOPE')).toEqual({});
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run services/axisProfile.test.ts`
Expected: FAIL — `previewOption` is not exported (기존 6개는 PASS 유지)

- [ ] **Step 3: 구현 추가**

`services/axisProfile.ts` 하단에 추가:

```ts
export function previewOption(
  profile: AxisStance[],
  checkpoint: Checkpoint,
  optionId: string
): Partial<Record<AxisName, AxisJudgement>> {
  const opt = findOption(checkpoint, optionId);
  if (!opt) return {};
  const axes: Record<string, string> =
    checkpoint === Checkpoint.DC1 ? (opt.bias_axis_pref ?? {}) : (opt.engine_axes ?? {});
  const byAxis = new Map(profile.map(s => [s.axis, s]));
  const out: Partial<Record<AxisName, AxisJudgement>> = {};
  for (const [axisKey, value] of Object.entries(axes)) {
    const axis = axisKey as AxisName;
    const stance = byAxis.get(axis);
    if (!stance) continue;
    if (stance.forbidden !== null && value === stance.forbidden) { out[axis] = 'forbidden'; continue; }
    const baseline = stance.current ?? stance.preferred;
    if (baseline === null) { out[axis] = 'new'; continue; }
    if (value === baseline) { out[axis] = 'match'; continue; }
    if (isWeakPair(axis, value, baseline)) { out[axis] = 'weak'; continue; }
    out[axis] = 'conflict';
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run services/axisProfile.test.ts`
Expected: PASS — 11 tests passed

- [ ] **Step 5: lint 확인 후 커밋**

```bash
npm run lint
git add services/axisProfile.ts services/axisProfile.test.ts
git commit -m "feat: add per-option axis judgement preview

Judges each axis an option claims against the accumulated profile:
match / weak / conflict / forbidden / new, with DC1 preference as the
baseline before any engine_axes claims exist.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 3: `replayDecisionChain` (결정 체인 리플레이)

**Files:**
- Create: `services/decisionChain.ts`
- Test: `services/decisionChain.test.ts`

**Interfaces:**
- Consumes: `services/logicEngine.ts`의 `calculateAvailableOptions(checkpoint, selections)`; `types.ts`의 `Checkpoint`, `CHECKPOINT_ORDER`, `DecisionLog`, `SelectionState`, `BlockedOption`
- Produces (Task 5가 사용):
  - `interface ChainStep { checkpoint: Checkpoint; selected: { id: string; label: string; hadWarning: boolean }[]; blocked: BlockedOption[] }`
  - `interface ChainEdge { fromCheckpoint: Checkpoint; toCheckpoint: Checkpoint; blockedOptionId: string; blockedOptionLabel: string; reason: string }`
  - `interface DecisionChain { steps: ChainStep[]; edges: ChainEdge[] }`
  - `function replayDecisionChain(logs: DecisionLog[]): DecisionChain`
  - `function parseBlockSource(blockedBy: string, fallback: Checkpoint): Checkpoint` (테스트 대상이므로 export)

**`blocked_by` 문자열 포맷 (logicEngine이 생성하는 실제 값):** `"DC2"`, `"DC5(DC5.A)"`, `"DC1 Logic"`, `"DC2 Combo"` — 문자열 안의 첫 `DC숫자` 토큰이 원인 체크포인트다.

- [ ] **Step 1: 실패하는 테스트 작성**

`services/decisionChain.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import { Checkpoint, DecisionLog } from '../types';
import { replayDecisionChain, parseBlockSource } from './decisionChain';

const log = (checkpoint: Checkpoint, id: string | string[]): DecisionLog => ({
  checkpoint,
  selectedId: id,
  selectedLabel: id,
  timestamp: 0,
});

describe('parseBlockSource', () => {
  it('logicEngine이 만드는 4가지 포맷을 파싱한다', () => {
    expect(parseBlockSource('DC2', Checkpoint.DC1)).toBe(Checkpoint.DC2);
    expect(parseBlockSource('DC5(DC5.A)', Checkpoint.DC1)).toBe(Checkpoint.DC5);
    expect(parseBlockSource('DC1 Logic', Checkpoint.DC2)).toBe(Checkpoint.DC1);
    expect(parseBlockSource('DC2 Combo', Checkpoint.DC1)).toBe(Checkpoint.DC2);
  });

  it('파싱 불가 문자열은 fallback을 반환한다', () => {
    expect(parseBlockSource('???', Checkpoint.DC4)).toBe(Checkpoint.DC4);
  });
});

describe('replayDecisionChain', () => {
  it('빈 로그: 빈 체인', () => {
    expect(replayDecisionChain([])).toEqual({ steps: [], edges: [] });
  });

  it('부분 로그: 있는 단계까지만 리플레이한다', () => {
    const chain = replayDecisionChain([log(Checkpoint.DC1, 'DC1-01')]);
    expect(chain.steps).toHaveLength(1);
    expect(chain.steps[0].checkpoint).toBe(Checkpoint.DC1);
    expect(chain.steps[0].blocked).toEqual([]); // DC1은 항상 전부 허용
  });

  it('DC1-01 이후 DC2 단계에서 DC2.E가 DC1 Logic으로 차단된다', () => {
    // DC1-01 forbid { Sharing: MANDATORY } → DC2.E(Sharing MANDATORY) score -3 < -2
    const chain = replayDecisionChain([
      log(Checkpoint.DC1, 'DC1-01'),
      log(Checkpoint.DC2, 'DC2.A'),
    ]);
    expect(chain.steps).toHaveLength(2);
    const dc2 = chain.steps[1];
    const blockedIds = dc2.blocked.map(b => b.id);
    expect(blockedIds).toContain('DC2.E');
    const edge = chain.edges.find(e => e.blockedOptionId === 'DC2.E');
    expect(edge).toBeDefined();
    expect(edge!.fromCheckpoint).toBe(Checkpoint.DC1);
    expect(edge!.toCheckpoint).toBe(Checkpoint.DC2);
  });

  it('DC2.A 선택 후 DC5 단계에서 DC5.B가 Combo 규칙으로 차단된다', () => {
    const chain = replayDecisionChain([
      log(Checkpoint.DC1, 'DC1-01'),
      log(Checkpoint.DC2, 'DC2.A'),
      log(Checkpoint.DC5, ['DC5.A']),
    ]);
    const dc5 = chain.steps[2];
    const comboBlocked = dc5.blocked.find(b => b.id === 'DC5.B');
    expect(comboBlocked).toBeDefined();
    expect(comboBlocked!.blocked_by).toContain('DC2 Combo');
    const edge = chain.edges.find(e => e.blockedOptionId === 'DC5.B');
    expect(edge!.fromCheckpoint).toBe(Checkpoint.DC2);
    expect(edge!.toCheckpoint).toBe(Checkpoint.DC5);
  });

  it('경고 상태로 선택한 옵션은 hadWarning=true', () => {
    // DC2.A soft dc7 패턴 { Exposure: HIGH, Expression: EXPRESSIVE } → DC7-02 warning
    const chain = replayDecisionChain([
      log(Checkpoint.DC1, 'DC1-01'),
      log(Checkpoint.DC2, 'DC2.A'),
      log(Checkpoint.DC5, ['DC5.C']),
      log(Checkpoint.DC3, ['DC3-03']),
      log(Checkpoint.DC4, ['DC4-02']),
      log(Checkpoint.DC6, ['DC6-09']),
      log(Checkpoint.DC7, ['DC7-02']),
    ]);
    expect(chain.steps).toHaveLength(7);
    const dc7 = chain.steps[6];
    expect(dc7.selected[0]).toMatchObject({ id: 'DC7-02', hadWarning: true });
    // DC2.A hard dc7 패턴 { Expression: FILTERED } → DC7-03, DC7-05 차단
    const blockedIds = dc7.blocked.map(b => b.id);
    expect(blockedIds).toContain('DC7-03');
    expect(blockedIds).toContain('DC7-05');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run services/decisionChain.test.ts`
Expected: FAIL — `Cannot find module './decisionChain'`

- [ ] **Step 3: 구현 작성**

`services/decisionChain.ts` 생성:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run services/decisionChain.test.ts`
Expected: PASS — 7 tests passed

- [ ] **Step 5: 전체 테스트 + lint 후 커밋**

```bash
npm test
npm run lint
git add services/decisionChain.ts services/decisionChain.test.ts
git commit -m "feat: reconstruct decision chain by replaying logs through logic engine

Replays DecisionLog[] in CHECKPOINT_ORDER through the pure
calculateAvailableOptions to recover per-step blocked options and
selected-with-warning flags, and derives cause edges by parsing
blocked_by strings back to their source checkpoint.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 4: `AxisProfilePanel` + DecisionView 통합

**Files:**
- Create: `src/components/AxisProfilePanel.tsx`
- Modify: `src/components/DecisionView.tsx`

**Interfaces:**
- Consumes: Task 1·2의 `computeAxisProfile`, `previewOption`, `AxisJudgement`; `types.ts`의 `Checkpoint`, `DecisionLog`
- Produces: `AxisProfilePanel` 컴포넌트 — props `{ logs: DecisionLog[]; checkpoint: Checkpoint; previewId: string | null }`

UI 검증은 Task 6에서 브라우저로 수행한다 (이 프로젝트에 컴포넌트 테스트 인프라를 새로 도입하지 않는다 — 스펙 §5는 순수 모듈 테스트만 요구).

- [ ] **Step 1: AxisProfilePanel 컴포넌트 작성**

`src/components/AxisProfilePanel.tsx` 생성:

```tsx
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
```

- [ ] **Step 2: DecisionView에 통합**

`src/components/DecisionView.tsx`에 세 가지 수정:

(a) import 수정 — 파일 상단:

```tsx
// 변경 전
import React from 'react';
// 변경 후
import React, { useState } from 'react';
```

그리고 기존 import들 아래에 추가:

```tsx
import AxisProfilePanel from './AxisProfilePanel';
```

(b) hover 상태 추가 — 컴포넌트 본문 시작부 (`const k = state.lastEngineOutput;` 바로 위):

```tsx
  const [hoverId, setHoverId] = useState<string | null>(null);
```

`const maxLimit = ...` 아래에 미리보기 대상 계산 추가:

```tsx
  const previewId =
    hoverId ?? (currentSelections.length > 0 ? currentSelections[currentSelections.length - 1] : null);
```

(c) 패널 삽입 — LOGIC STATUS 박스가 있는 `<div className="mb-12">` 블록의 닫는 `</div>` 바로 다음, `<div className="grid grid-cols-1 md:grid-cols-2 gap-12">` 바로 앞에:

```tsx
            <AxisProfilePanel
              logs={state.logs}
              checkpoint={state.currentCheckpoint}
              previewId={previewId}
            />
```

(d) 옵션 버튼에 hover 핸들러 — `k.available_options.map` 안의 `<button key={opt.id} onClick={() => handleToggleOption(opt.id)}`에 두 prop 추가:

```tsx
                        onMouseEnter={() => setHoverId(opt.id)}
                        onMouseLeave={() => setHoverId(null)}
```

- [ ] **Step 3: lint + 전체 테스트 확인**

Run: `npm run lint && npm test`
Expected: 둘 다 PASS (기존 11 + 7 = 18 tests)

- [ ] **Step 4: 커밋**

```bash
git add src/components/AxisProfilePanel.tsx src/components/DecisionView.tsx
git commit -m "feat: show 9-axis profile strip with per-option preview in DecisionView

Strip shows the accumulated stance per axis (italic = DC1 preference
only), flags intra-axis conflicts, and colors each axis by
match/weak/conflict/forbidden/new when an option is hovered or selected.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 5: `DecisionChainDiagram` + ResultPage 통합

**Files:**
- Create: `src/components/DecisionChainDiagram.tsx`
- Modify: `src/components/ResultPage.tsx`

**Interfaces:**
- Consumes: Task 3의 `replayDecisionChain`, `DecisionChain`; `types.ts`의 `CHECKPOINT_LABELS`, `DecisionLog`
- Produces: `DecisionChainDiagram` 컴포넌트 — props `{ logs: DecisionLog[] }`. 차단이 하나도 없으면 `null` 렌더 (스펙 §3.5).

- [ ] **Step 1: DecisionChainDiagram 컴포넌트 작성**

`src/components/DecisionChainDiagram.tsx` 생성:

```tsx
import React, { useMemo } from 'react';
import { CHECKPOINT_LABELS, DecisionLog } from '@/types';
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

  const cpIndex = new Map(chain.steps.map((s, i) => [s.checkpoint, i]));
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
```

- [ ] **Step 2: ResultPage에 통합**

`src/components/ResultPage.tsx`에 두 가지 수정:

(a) import 추가 — `import { buildDesignBrief } from '../utils/designBrief';` 아래:

```tsx
import DecisionChainDiagram from './DecisionChainDiagram';
```

(b) 컴포넌트 삽입 — 왼쪽 컬럼에서 `1. Decision Summary` div의 닫는 `</div>` 다음, `{/* 2. Design Logic Explanation */}` 주석 바로 앞에:

```tsx
            <DecisionChainDiagram logs={state.logs} />
```

(삽입 후 왼쪽 컬럼 구조: Decision Summary → **Constraint Chain** → Narrative Logic.)

- [ ] **Step 3: lint + 전체 테스트 확인**

Run: `npm run lint && npm test`
Expected: 둘 다 PASS

- [ ] **Step 4: 커밋**

```bash
git add src/components/DecisionChainDiagram.tsx src/components/ResultPage.tsx
git commit -m "feat: render decision constraint chain diagram on ResultPage

SVG timeline of the 7 checkpoints showing selected options (amber
border when a warning was accepted), blocked options, and cause edges
from the decision that triggered each block, with reasons on hover.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YBM4wFVDpFcgWDMm6X2uuV"
```

---

### Task 6: 최종 검증 (lint + 테스트 + 브라우저 확인) 후 push

**Files:**
- Create (scratchpad, 저장소 밖): `<scratchpad>/verify/verify-visualization.mjs`
- Create (저장소, gitignored): `.env.local` — 이미 존재하면 만들지 말 것

**배경:** Gemini API 키 없이 `runKernel`은 키 부재 시 throw해서 UI가 로딩에 멈춘다. 그러나 **더미 키**를 넣으면 API 호출이 실패해도 catch 폴백이 allowed/blocked 목록을 그대로 반환하므로 결정 플로우 전체를 걸을 수 있다. 최종 리포트/EP1은 실패해도(에러 status) ResultPage는 렌더되고, 체인 다이어그램은 `logs`만 쓰므로 정상 동작한다.

- [ ] **Step 1: 정적 검증**

```bash
cd /home/user/Arch-Decision-OS
npm run lint && npm test
```
Expected: lint 통과, 18 tests passed

- [ ] **Step 2: dev 서버 준비**

`.env.local`이 없으면 생성 (gitignored — 커밋 금지):

```bash
[ -f .env.local ] || echo 'GEMINI_API_KEY=dummy-key-for-ui-verification' > .env.local
npm run dev &   # http://localhost:3000, 백그라운드 실행
```

- [ ] **Step 3: Playwright 검증 스크립트 작성**

scratchpad에 격리 설치 (저장소 package.json 오염 금지):

```bash
mkdir -p "$SCRATCHPAD/verify" && cd "$SCRATCHPAD/verify"
npm init -y && npm install playwright
```

`$SCRATCHPAD/verify/verify-visualization.mjs` 생성:

```js
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('dialog', d => d.accept());

await page.goto('http://localhost:3000/');
// StartScreen: 프로젝트명 입력 후 시작
await page.locator('input').first().fill('Verification Run');
await page.getByRole('button', { name: /START|시작/i }).click();

for (let stage = 1; stage <= 7; stage++) {
  // 커널 폴백 응답 대기 → 옵션 버튼 렌더
  const option = page.locator('main .space-y-3 button').first();
  await option.waitFor({ timeout: 60000 });
  if (stage === 2) {
    // DC2에서 축 스트립 + hover 미리보기 스크린샷
    await option.hover();
    await page.screenshot({ path: 'shot-dc2-axis-strip.png', fullPage: true });
  }
  await option.click();
  await page.getByRole('button', { name: 'CONFIRM SELECTION' }).click();
}

// ResultPage: 체인 다이어그램 대기
await page.waitForURL('**/result', { timeout: 30000 });
await page.getByText('Constraint Chain').waitFor({ timeout: 30000 });
await page.screenshot({ path: 'shot-result-chain.png', fullPage: true });

console.log('OK: axis strip + chain diagram rendered');
await browser.close();
```

- [ ] **Step 4: 실행 및 스크린샷 확인**

```bash
node verify-visualization.mjs
```
Expected: `OK: axis strip + chain diagram rendered` 출력, 스크린샷 2장 생성.

스크린샷 2장을 Read 도구로 열어 눈으로 확인:
1. `shot-dc2-axis-strip.png` — 9축 스트립이 보이고, hover된 옵션에 대해 셀들이 색상(emerald/amber/red/indigo)으로 구분되는가. DC1-01 선택 후라면 Exposure/Separation 셀에 이탤릭 선호값(LOW/SEPARATED)이 보여야 한다.
2. `shot-result-chain.png` — Constraint Chain 섹션에 7행, emerald 선택 노드, 점선 red 차단 노드, 원인 곡선이 보이는가. (첫 옵션만 클릭하는 경로에서는 DC2에서 DC2.E 차단, DC5에서 DC5.B 차단 등이 반드시 존재한다.)

문제 발견 시 해당 Task로 돌아가 수정 후 이 Task를 다시 실행한다.

- [ ] **Step 5: dev 서버 종료 및 push**

```bash
kill %1 2>/dev/null  # dev 서버 종료
cd /home/user/Arch-Decision-OS
git status --short   # .env.local 외에 미커밋 변경이 없는지 확인 (.env.local은 gitignored라 안 보여야 정상)
git push -u origin claude/architecture-design-os-dev-4meg98
```
Expected: push 성공. (네트워크 오류 시에만 2s/4s/8s/16s 백오프로 최대 4회 재시도.)

---

## Self-Review 결과 (계획 작성 후 점검 완료)

- **스펙 커버리지:** §3.2→Task 1·2, §3.3→Task 3, §3.4→Task 4, §3.5→Task 5, §4(에러 처리)→Task 1·3의 미지 id/빈 로그/부분 로그 테스트, §5(테스트)→Task 1–3, §6(성공 기준)→Task 6. 갭 없음.
- **타입 일관성:** `AxisStance`/`AxisJudgement`(T1)를 T2·T4가, `DecisionChain`/`ChainStep`/`ChainEdge`(T3)를 T5가 동일 시그니처로 사용. `previewId: string | null` prop 명칭 T4 내 일치.
- **플레이스홀더:** 없음 — 모든 코드 스텝에 전체 코드 포함.
