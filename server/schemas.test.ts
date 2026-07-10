import { describe, it, expect } from 'vitest';
import {
  KERNEL_SCHEMA,
  FINAL_REPORT_SCHEMA,
  VISUAL_GUIDE_SCHEMA,
  EP1_SCHEMA,
} from './prompts';

// Claude 구조화 출력 요구사항을 재귀 검증한다:
// 모든 object 노드에 additionalProperties:false, required ⊆ properties 키.
function checkNode(node: any, path: string, problems: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    if (node.additionalProperties !== false) {
      problems.push(`${path}: additionalProperties !== false`);
    }
    if (!Array.isArray(node.required)) {
      problems.push(`${path}: required 배열 없음`);
    } else {
      const keys = Object.keys(node.properties ?? {});
      for (const r of node.required) {
        if (!keys.includes(r)) problems.push(`${path}: required '${r}'가 properties에 없음`);
      }
    }
    for (const [k, v] of Object.entries(node.properties ?? {})) {
      checkNode(v, `${path}.${k}`, problems);
    }
  }
  if (node.type === 'array') checkNode(node.items, `${path}[]`, problems);
}

const ALL = {
  KERNEL_SCHEMA,
  FINAL_REPORT_SCHEMA,
  VISUAL_GUIDE_SCHEMA,
  EP1_SCHEMA,
} as const;

describe('Claude 구조화 출력 스키마', () => {
  for (const [name, schema] of Object.entries(ALL)) {
    it(`${name}: 모든 object 노드가 요구사항을 만족한다`, () => {
      const problems: string[] = [];
      checkNode(schema, name, problems);
      expect(problems).toEqual([]);
    });
  }

  it('EP1_SCHEMA: domain_vector는 JSON 문자열 필드로 대체되었다', () => {
    const props = (EP1_SCHEMA as any).properties;
    expect(props.domain_vector).toBeUndefined();
    expect(props.domain_vector_json).toEqual(
      expect.objectContaining({ type: 'string' })
    );
    expect((EP1_SCHEMA as any).required).toContain('domain_vector_json');
  });
});
