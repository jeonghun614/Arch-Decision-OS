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
