# 논리 일관성 가시화 (Logic Consistency Visualization) — Design Spec

- 날짜: 2026-07-09
- 상태: 승인됨 (사용자 확인)
- 브랜치: `claude/architecture-design-os-dev-4meg98`

## 1. 배경과 문제

Arch-Decision-OS의 핵심 가치는 건축 설계 학생이 **일관된 사고방식**으로 결정을
쌓아가도록 돕는 것이다. 현재 시스템은:

- Logic Engine이 9축(Exposure, Encounter, Access, Sharing, Temporal,
  Separation, Centrality, Mass, Expression) 기반으로 선택지를 허용/경고/차단하지만,
  학생에게는 **결과(차단 목록)만** 보이고 **누적된 논리 상태**는 보이지 않는다.
- 결정들 사이의 구속 관계("DC2에서 A를 골랐기 때문에 DC5에서 B가 차단됐다")가
  결과 페이지의 AI 생성 텍스트로만 서술되고, 기계적·시각적으로 확인할 수 없다.

이 프로젝트는 결정 **중**과 결정 **후** 두 시점에서 논리 일관성을 시각화한다.

## 2. 목표 / 비목표

### 목표
1. **축 프로파일 스트립** (DecisionView): 지금까지의 선택이 만든 9축 누적 입장을
   상시 표시하고, 옵션 hover/선택 시 그 옵션이 축별로 정합·충돌하는지 미리보기.
2. **결정 체인 다이어그램** (ResultPage): DC1→DC7 각 단계에서 무엇을 골랐고,
   그 선택이 이후 단계에서 무엇을 차단했는지 SVG로 표시.
3. 두 시각화 모두 **결정론적 순수 함수**로 계산 — Gemini API 무관, 오프라인 동작.

### 비목표
- What-if 비교 탐색 (다른 선택 시나리오 병렬 비교) — 다음 차수.
- 기존 상태 구조·localStorage 포맷 변경 — 하지 않는다.
- logicEngine 규칙 자체의 수정/확장 — 하지 않는다.
- 매스/평면 지오메트리 시각화 — 별도 주제.

## 3. 아키텍처

### 3.1 접근: 순수 파생 + 리플레이

`calculateAvailableOptions(checkpoint, selections)`는 순수 함수이므로,
저장된 `DecisionLog[]`를 시간순으로 리플레이하면 각 단계의 차단 상태를
저장 없이 재구성할 수 있다. 따라서 **새 저장 상태는 없다**. 모든 시각화
데이터는 `logs`(및 `DC_LIBRARY`/`LOGIC_RULES`)에서 파생된다.

```
DecisionLog[] ──▶ services/axisProfile.ts   ──▶ AxisProfilePanel (DecisionView)
             └──▶ services/decisionChain.ts ──▶ DecisionChainDiagram (ResultPage)
```

### 3.2 새 모듈: `services/axisProfile.ts`

```ts
export type AxisJudgement = 'match' | 'weak' | 'conflict' | 'forbidden' | 'new';

export interface AxisClaim {
  checkpoint: Checkpoint;      // 어느 결정이
  optionId: string;            // 어떤 옵션으로
  optionLabel: string;
  value: string;               // 이 축에 어떤 값을 주장했나
}

export interface AxisStance {
  axis: AxisName;
  claims: AxisClaim[];         // 시간순 주장 목록
  current: string | null;      // 대표 값 (가장 최근 주장; 없으면 null)
  preferred: string | null;    // DC1 bias_axis_pref의 값
  forbidden: string | null;    // DC1 anti_axis_forbid의 값
  conflict: boolean;           // claims 안에 비호환 값 쌍 존재 여부
}

// 누적 프로파일: 9축 전체에 대해 AxisStance 계산
export function computeAxisProfile(logs: DecisionLog[]): AxisStance[];

// 옵션 미리보기: 옵션의 engine_axes(DC1은 bias/anti)를 프로파일과 비교
export function previewOption(
  profile: AxisStance[],
  checkpoint: Checkpoint,
  optionId: string
): Partial<Record<AxisName, AxisJudgement>>;
```

**판정 규칙** (previewOption, 축별). 비교 기준값 = `current ?? preferred`
(claims가 아직 없으면 DC1의 선호값이 기준이 된다):
1. 옵션 값 == DC1 `anti_axis_forbid` 값 → `forbidden`
2. 기준값 없음 → `new`
3. 옵션 값 == 기준값 → `match`
4. 옵션 값과 기준값이 `LOGIC_RULES.execution_spec.weak_match_pairs`로 연결 → `weak`
5. 그 외 → `conflict`

**충돌 판정** (AxisStance.conflict): claims의 값 집합에서 서로 같지 않고
weak pair로도 연결되지 않는 쌍이 하나라도 있으면 true.

옵션 조회는 기존 `DC_LIBRARY`를 사용한다 (DC2/DC5는 `type` 필드가 id 역할 —
기존 `geminiService.getOptionDetails`와 동일한 매칭 규칙).

### 3.3 새 모듈: `services/decisionChain.ts`

```ts
export interface ChainStep {
  checkpoint: Checkpoint;
  selected: { id: string; label: string; hadWarning: boolean }[];
  blocked: BlockedOption[];    // 이 단계 진입 시점에 차단돼 있던 옵션들
}

export interface ChainEdge {
  fromCheckpoint: Checkpoint;  // 차단 원인이 된 결정 단계
  toCheckpoint: Checkpoint;    // 차단이 발생한 단계
  blockedOptionId: string;
  blockedOptionLabel: string;
  reason: string;
}

export interface DecisionChain {
  steps: ChainStep[];
  edges: ChainEdge[];
}

export function replayDecisionChain(logs: DecisionLog[]): DecisionChain;
```

**리플레이 절차**: `CHECKPOINT_ORDER` 순서로, 각 단계에서
(1) 그 시점까지의 부분 `SelectionState`를 구성하고
(2) `calculateAvailableOptions(cp, partialSelections)`를 호출해 blocked를 캡처,
(3) 로그의 해당 선택이 warning 상태였는지 기록한 뒤 선택을 반영한다.
로그가 없는 단계(중도 이탈)는 그 단계까지만 리플레이한다.

**엣지 원인 파싱**: `blocked_by` 문자열의 기존 포맷을 그대로 해석한다 —
`"DC2"` → DC2, `"DC5(DC5.A)"` → DC5, `"DC1 Logic"` → DC1, `"DC2 Combo"` → DC2.
파싱 불가 문자열은 해당 단계의 직전 결정 단계로 폴백한다.

### 3.4 UI: `src/components/AxisProfilePanel.tsx` (DecisionView)

- 위치: LOGIC STATUS 박스 아래, 옵션 그리드 위. 9축 가로 스트립(좁은 화면 줄바꿈).
- 셀 구성: 축 이름(mono 소문자 약칭) + 현재 대표 값(없으면 `—`).
- 색: 기존 디자인 언어 유지 — 기본 zinc, 충돌 축 red 테두리,
  미리보기 시 judgement별로 emerald(match)/amber(weak)/red(conflict·forbidden)/indigo(new).
- 상호작용: DecisionView가 hover 중인 옵션 id를 로컬 state로 관리해 전달.
  hover가 없으면 현재 `currentSelections`의 첫 옵션을 미리보기 대상으로 사용.
  터치 환경에서는 선택(토글)이 곧 미리보기가 된다.
- 데이터: `computeAxisProfile(state.logs)` + `previewOption(...)`.
  logs가 비어 있으면(DC1) 프로파일 전체가 미정으로 표시되고 미리보기만 동작.

### 3.5 UI: `src/components/DecisionChainDiagram.tsx` (ResultPage)

- 위치: ResultPage 왼쪽 컬럼, Decision Summary 섹션 아래.
- 형태: 세로 방향 7행(DC1→DC7) SVG. 각 행에 선택 노드(emerald 채움,
  warning 수락 시 amber 테두리)와 차단 노드(dim red, 취소선 스타일).
- 엣지: 원인 단계의 선택 노드 → 차단 노드로 곡선. 색 red 계열, 저채도.
- 툴팁: 엣지/차단 노드 hover 시 `reason` 표시 (SVG `<title>` 사용 — 추가 라이브러리 없음).
- 차단이 하나도 없는 실행이면 섹션 자체를 렌더하지 않는다.
- 데이터: `replayDecisionChain(state.logs)` — `state.completed`일 때만 렌더.

### 3.6 데이터 흐름 요약

- 입력: `ProjectState.logs` (기존), `DC_LIBRARY`/`LOGIC_RULES` (기존 정적 데이터)
- 파생: axisProfile / decisionChain (신규 순수 모듈, 메모이제이션은 `useMemo`로 충분)
- 출력: 두 신규 컴포넌트. **기존 상태·저장 포맷·Gemini 호출 변경 없음.**

## 4. 에러 처리

- 순수 모듈은 빈 로그·부분 로그(중도 재시작)에서 빈 결과/부분 결과를 반환한다.
  UI는 빈 결과 시 해당 섹션을 숨긴다.
- 로그에 정적 데이터에 없는 옵션 id가 있으면(정적 데이터 개정 후 옛 localStorage)
  그 claim/노드는 label을 id로 대체해 표시하고 판정에서 제외한다. throw하지 않는다.

## 5. 테스트

- vitest를 devDependency로 추가, `npm test` 스크립트 등록.
- `services/axisProfile.test.ts`: 빈 로그 / DC1만 / 충돌 시나리오(예: DC2.D 이후
  Exposure HIGH 옵션 미리보기 → conflict) / weak pair 판정 / forbidden 판정 /
  미지 옵션 id 무해 통과.
- `services/decisionChain.test.ts`: 대표 시나리오(DC1-01 → DC2.A → …) 리플레이가
  단계별 blocked를 재구성하는지, `blocked_by` 파싱( DC5(DC5.A) / Combo / Logic ),
  부분 로그 처리.
- 기존 `npm run lint`(tsc --noEmit) 통과 유지.

## 6. 성공 기준

1. `npm run lint` 통과, `npm test` 통과(신규 테스트 포함).
2. dev 서버에서: DC2 단계 진입 시 축 스트립이 DC1의 선호/금지를 반영하고,
   옵션 hover 시 축별 색 미리보기가 동작한다.
3. 7단계 완주 후 ResultPage에 체인 다이어그램이 렌더되고, 차단 엣지가
   원인 단계에서 출발한다. (브라우저로 실제 확인)

## 7. 구현 파일 목록

| 파일 | 작업 |
|---|---|
| `services/axisProfile.ts` | 신규 — 프로파일/미리보기 순수 로직 |
| `services/decisionChain.ts` | 신규 — 리플레이/엣지 순수 로직 |
| `services/axisProfile.test.ts` | 신규 — 단위 테스트 |
| `services/decisionChain.test.ts` | 신규 — 단위 테스트 |
| `src/components/AxisProfilePanel.tsx` | 신규 — 축 스트립 UI |
| `src/components/DecisionChainDiagram.tsx` | 신규 — 체인 SVG UI |
| `src/components/DecisionView.tsx` | 수정 — 패널 삽입 + hover state 전달 |
| `src/components/ResultPage.tsx` | 수정 — 다이어그램 섹션 삽입 |
| `package.json` | 수정 — vitest 추가, `test` 스크립트 |
