import { describe, it, expect } from 'vitest';
import { Checkpoint, DecisionLog } from '../types';
import { computeAxisProfile, previewOption } from './axisProfile';

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

  it('current가 있으면 preferred보다 우선한다 (baseline = current ?? preferred)', () => {
    // DC1-01 preferred: { Exposure: LOW, Separation: SEPARATED }
    // DC2.E claims: Exposure HIGH, Separation INTEGRATED → current가 preferred와 달라진다
    const profile = computeAxisProfile([
      log(Checkpoint.DC1, 'DC1-01'),
      log(Checkpoint.DC2, 'DC2.E'),
    ]);
    // DC2.A: Exposure LOW / Separation SEPARATED —
    // current(HIGH/INTEGRATED) 기준이면 conflict, preferred 기준이면 match가 되므로
    // 이 테스트는 우선순위가 뒤집히는 회귀를 잡아낸다
    const p = previewOption(profile, Checkpoint.DC2, 'DC2.A');
    expect(p.Exposure).toBe('conflict');
    expect(p.Separation).toBe('conflict');
  });
});
