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
