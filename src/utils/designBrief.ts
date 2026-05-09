import { BlueprintJSON } from '@/types';

const mm2m = (mm: number) => Math.round(mm / 100) / 10;       // mm → m (소수 1자리)
const mm2m2 = (mm2: number) => Math.round(mm2 / 1e4) / 100;   // mm² → m² (소수 2자리)

export interface BriefBlock {
  title: string;
  color: 'emerald' | 'indigo' | 'amber' | 'zinc';
  rows: { label: string; value: string; sub?: string; highlight?: boolean }[];
}

export function buildDesignBrief(bp: BlueprintJSON): BriefBlock[] {
  const { inputs, computed, blueprint, program_tree, ep2 } = bp;
  const blocks: BriefBlock[] = [];

  // ── 1. 볼륨 & 층고 ─────────────────────────────────────
  const totalHeightMm = (inputs.floors - 1) * inputs.floor_to_floor_mm + inputs.floor_to_floor_mm;
  const rows1: BriefBlock['rows'] = [
    {
      label: '대지 규모',
      value: `${mm2m(inputs.site_width_mm)} × ${mm2m(inputs.site_depth_mm)} m`,
      sub: `${mm2m2(computed.site_area_mm2)} m²`,
    },
    {
      label: '층 구성',
      value: `지상 ${inputs.floors}층`,
      sub: `표준 층고 ${mm2m(inputs.floor_to_floor_mm)} m / 총 높이 ${mm2m(totalHeightMm)} m`,
    },
    { label: '건폐율', value: `${Math.round(inputs.coverage_ratio * 100)} %`, sub: `바닥면적 ${mm2m2(computed.footprint_mm2)} m²` },
    { label: '연면적 (GFA)', value: `${mm2m2(computed.gross_floor_area_mm2)} m²`, highlight: true },
    { label: '실 사용 면적', value: `${mm2m2(computed.net_program_area_mm2)} m²`, sub: `효율 ${Math.round(inputs.efficiency_ratio * 100)} %` },
  ];

  // EP2 층별 유효 면적이 있으면 추가
  if (ep2?.usable_area_by_floor) {
    const floorEntries = Object.entries(ep2.usable_area_by_floor)
      .filter(([, v]) => v !== null)
      .map(([f, v]) => `${f}층 ${mm2m2((v as number))} m²`)
      .join(' / ');
    if (floorEntries) {
      rows1.push({ label: '층별 유효 면적', value: floorEntries });
    }
  }

  blocks.push({ title: '볼륨 & 층고', color: 'emerald', rows: rows1 });

  // ── 2. 수직 연속 & 보이드 ──────────────────────────────
  if (program_tree) {
    const multiLevelSpaces = program_tree.spaces.filter(
      sp => sp.placement.span.type === 'MULTI_LEVEL'
    );
    const voidSpaces = program_tree.spaces.filter(
      sp => sp.category_label === 'VOID'
    );

    if (multiLevelSpaces.length > 0 || voidSpaces.length > 0 || (ep2?.void_nodes?.length ?? 0) > 0) {
      const rows2: BriefBlock['rows'] = [];

      // 수직 코어 (STAIR/ELEVATOR)
      multiLevelSpaces
        .filter(sp => ['STAIR', 'ELEVATOR', 'MEP_SHAFT'].includes(sp.space_type))
        .forEach(sp => {
          const fromF = sp.placement.span.from_floor;
          const toF = sp.placement.span.to_floor;
          const heightMm = (toF - fromF) * inputs.floor_to_floor_mm + inputs.floor_to_floor_mm;
          rows2.push({
            label: sp.name,
            value: `${fromF}층 → ${toF}층 관통`,
            sub: `수직 높이 ${mm2m(heightMm)} m / ${mm2m2(sp.area.total_mm2)} m²`,
          });
        });

      // 보이드 공간 (VOID category)
      voidSpaces.forEach(sp => {
        const fromF = sp.placement.span.from_floor;
        const toF = sp.placement.span.to_floor;
        const spanCount = toF - fromF + 1;
        const heightMm = spanCount * inputs.floor_to_floor_mm;
        rows2.push({
          label: sp.name,
          value: `${fromF}층 → ${toF}층 (${spanCount}개 층 관통)`,
          sub: `보이드 높이 ${mm2m(heightMm)} m / 바닥 면적 ${mm2m2(sp.area.total_mm2)} m²`,
          highlight: true,
        });
      });

      // EP2 보이드 노드 추가 정보
      ep2?.void_nodes?.forEach(v => {
        const spanCount = v.span.end_floor - v.span.start_floor + 1;
        const heightMm = spanCount * inputs.floor_to_floor_mm;
        const footprintRatio = v.footprint?.mode === 'RATIO'
          ? `바닥 점유 ${Math.round((v.footprint.value) * 100)} %`
          : '';
        rows2.push({
          label: `[EP2] ${v.void_type.replace('_', ' ')}`,
          value: `${v.span.start_floor}층 → ${v.span.end_floor}층`,
          sub: `높이 ${mm2m(heightMm)} m${footprintRatio ? ' / ' + footprintRatio : ''}`,
        });
      });

      if (rows2.length > 0) {
        blocks.push({ title: '수직 연속 & 보이드', color: 'indigo', rows: rows2 });
      }
    }
  }

  // ── 3. 프로그램 카테고리별 구성 ────────────────────────
  if (program_tree) {
    const catOrder = ['PRIMARY', 'PRIVATE', 'SHARED', 'BUFFER', 'SERVICE', 'CIRCULATION', 'VOID'];
    const grouped = new Map<string, typeof program_tree.spaces>();

    program_tree.spaces.forEach(sp => {
      if (!grouped.has(sp.category_label)) grouped.set(sp.category_label, []);
      grouped.get(sp.category_label)!.push(sp);
    });

    const rows3: BriefBlock['rows'] = [];
    const totalMm2 = computed.gross_floor_area_mm2;

    catOrder.forEach(cat => {
      const spaces = grouped.get(cat);
      if (!spaces) return;
      const totalCatMm2 = spaces.reduce((sum, sp) => sum + sp.area.total_mm2, 0);
      const pct = Math.round((totalCatMm2 / totalMm2) * 100);
      const spaceNames = spaces.map(sp => `${sp.name} (${mm2m2(sp.area.each_mm2)}m²)`).join(', ');
      rows3.push({
        label: `${cat} — ${spaces.length}개 공간`,
        value: `${mm2m2(totalCatMm2)} m²  ·  ${pct} %`,
        sub: spaceNames,
        highlight: cat === 'PRIMARY' || cat === 'PRIVATE',
      });
    });

    blocks.push({ title: '프로그램 카테고리별 구성', color: 'amber', rows: rows3 });
  }

  // ── 4. 주요 공간 관계 ──────────────────────────────────
  if (program_tree) {
    const edges = program_tree.relations.graph.edges;
    if (edges.length > 0) {
      // space id → name 매핑
      const spaceMap = new Map(program_tree.spaces.map(sp => [sp.id, sp.name]));

      const positive = [...edges]
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const negative = edges.filter(e => e.score < 0).slice(0, 3);

      const rows4: BriefBlock['rows'] = [];

      if (positive.length) {
        rows4.push({ label: '[ 강한 인접 관계 ]', value: '', highlight: true });
        positive.forEach(e => {
          rows4.push({
            label: `${spaceMap.get(e.from) ?? e.from}  ↔  ${spaceMap.get(e.to) ?? e.to}`,
            value: `R ${e.score}점`,
            sub: e.reason ?? e.relation_type,
          });
        });
      }

      if (negative.length) {
        rows4.push({ label: '[ 의도적 분리 관계 ]', value: '' });
        negative.forEach(e => {
          rows4.push({
            label: `${spaceMap.get(e.from) ?? e.from}  ✗  ${spaceMap.get(e.to) ?? e.to}`,
            value: `R ${e.score}점`,
            sub: e.reason ?? e.relation_type,
          });
        });
      }

      if (rows4.length > 0) {
        blocks.push({ title: '주요 공간 관계', color: 'zinc', rows: rows4 });
      }
    }
  }

  return blocks;
}
