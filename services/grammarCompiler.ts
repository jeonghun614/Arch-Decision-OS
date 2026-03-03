import { 
  SiteInputs, 
  SpatialGrammar, 
  BlueprintJSON, 
  DecisionLog, 
  Checkpoint 
} from "../types";
import mappingData from "../data/dc_to_grammar_mapping.json";
import { DC_LIBRARY } from "../data/staticData";

/**
 * Deep copy helper
 */
function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge with additive support for specific fields
 */
function deepMerge(target: any, source: any, additivePrefixes: string[] = []) {
  for (const key in source) {
    const path = key; // Simplified path tracking for this specific use case
    // In a real implementation, we'd track the full path (e.g., "grammar.program.area_bias.PRIVATE")
    // But since we know the structure, we can check if the current key's parent path matches.
  }
  
  // Recursive merge helper with path tracking
  const merge = (t: any, s: any, currentPath: string) => {
    for (const key in s) {
      const fullPath = currentPath ? `${currentPath}.${key}` : key;
      const isAdditive = additivePrefixes.some(prefix => fullPath.startsWith(prefix));

      if (isAdditive && typeof s[key] === 'number' && typeof t[key] === 'number') {
        t[key] += s[key];
      } else if (s[key] && typeof s[key] === 'object' && !Array.isArray(s[key])) {
        if (!t[key]) t[key] = {};
        merge(t[key], s[key], fullPath);
      } else {
        t[key] = deepCopy(s[key]);
      }
    }
  };

  merge(target, source, "");
  return target;
}

/**
 * Normalize Axis profile using keyword rules from natural language text
 */
function normalizeAxisByKeywords(text: string): Record<string, string> {
  const profile: Record<string, string> = {};
  const rules = mappingData.axis.normalize_hints.keyword_rules;

  for (const rule of rules) {
    const match = rule.if_contains_any.some(keyword => text.includes(keyword));
    if (match) {
      Object.assign(profile, rule.set);
    }
  }
  return profile;
}


/**
 * Main Compiler Function
 */
export function compileGrammar(
  inputs: SiteInputs,
  logs: DecisionLog[],
  finalReportText: string,
  existingAxisProfile?: Record<string, any>
): BlueprintJSON {
  // 1. Initialize with defaults
  let grammar: SpatialGrammar = deepCopy(mappingData.defaults.grammar as any);
  const additivePrefixes = mappingData.merge_strategy.additive_fields_prefix;

  // 2. Calculate cumulative Axis Profile from selections if not provided
  let axisProfile = existingAxisProfile || {};
  if (Object.keys(axisProfile).length === 0) {
    // Try to build from selections
    const allOptions: any[] = [
      ...DC_LIBRARY.dc1_options,
      ...DC_LIBRARY.dc2_types,
      ...DC_LIBRARY.dc3_options,
      ...DC_LIBRARY.dc4_options,
      ...DC_LIBRARY.dc5_types,
      ...DC_LIBRARY.dc6_options,
      ...DC_LIBRARY.dc7_options,
    ];
    for (const log of logs) {
      const ids = Array.isArray(log.selectedId) ? log.selectedId : [log.selectedId];
      for (const id of ids) {
        const opt = allOptions.find(o => (o.id === id || o.type === id));
        if (opt && opt.engine_axes) {
          Object.assign(axisProfile, opt.engine_axes);
        }
      }
    }
  }

  // 3. Best-effort keyword normalization if profile is still thin
  const keywordProfile = normalizeAxisByKeywords(finalReportText);
  axisProfile = { ...keywordProfile, ...axisProfile }; // Selections take precedence over keywords

  // 4. Apply DC mappings
  const dcChoices: { checkpoint: string; id: string | string[]; label: string | string[] }[] = [];
  
  for (const log of logs) {
    const checkpointKey = log.checkpoint as string;
    const mappingDc = (mappingData.dc as any)[checkpointKey];
    
    if (mappingDc) {
      const labels = Array.isArray(log.selectedLabel) ? log.selectedLabel : [log.selectedLabel];
      const ids = Array.isArray(log.selectedId) ? log.selectedId : [log.selectedId];
      
      dcChoices.push({ checkpoint: checkpointKey, id: log.selectedId, label: log.selectedLabel });

      for (const label of labels) {
        const optionMapping = mappingDc.options[label];
        if (optionMapping && optionMapping.apply) {
          // Convert dot notation keys to nested object for deepMerge
          const patch = {};
          for (const [path, value] of Object.entries(optionMapping.apply)) {
            const keys = path.split('.');
            let current: any = patch;
            for (let i = 0; i < keys.length - 1; i++) {
              if (!current[keys[i]]) current[keys[i]] = {};
              current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
          }
          deepMerge(grammar, (patch as any).grammar || patch, additivePrefixes);
        }
      }
    }
  }

  // 5. Axis Adjustments
  for (const adj of mappingData.axis.adjustments) {
    const isMatch = Object.entries(adj.when).every(([key, value]) => axisProfile[key] === value);
    if (isMatch) {
      const patch = {};
      for (const [path, value] of Object.entries(adj.apply)) {
        const keys = path.split('.');
        let current: any = patch;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) current[keys[i]] = {};
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      }
      deepMerge(grammar, (patch as any).grammar || patch, additivePrefixes);
    }
  }

  // 6. Computed Values
  const site_area_m2 = inputs.site_width_m * inputs.site_depth_m;
  const footprint_m2 = site_area_m2 * inputs.coverage_ratio;
  const gross_floor_area_m2 = footprint_m2 * inputs.floors;
  const net_program_area_m2 = gross_floor_area_m2 * inputs.efficiency_ratio;

  const levels = Array.from({ length: inputs.floors }, (_, i) => ({
    level: `L${(i + 1).toString().padStart(2, '0')}`,
    elevation_mm: i * inputs.floor_to_floor_mm
  }));

  // 5. Blueprint Programs
  const programTypes = ["PRIMARY", "PRIVATE", "SHARED", "BUFFER", "SERVICE", "CIRCULATION"];
  const programs = programTypes.map(type => {
    const baseRatio = grammar.program.base_ratios[type] || 0;
    const bias = grammar.program.area_bias[type] || 0;
    const finalRatio = Math.max(0, baseRatio + bias);
    return {
      id: type.substring(0, 3),
      type,
      label: type.charAt(0) + type.slice(1).toLowerCase() + " Area",
      area_target_m2: net_program_area_m2 * finalRatio
    };
  });

  // 6. Blueprint Relations (Basic Proposal)
  const edges: any[] = [];
  const pIds = programs.map(p => p.id);
  for (let i = 0; i < pIds.length; i++) {
    for (let j = i + 1; j < pIds.length; j++) {
      const v = Math.floor(Math.random() * 5); // Placeholder logic
      const a = Math.floor(Math.random() * 5) + 1;
      edges.push({
        from: pIds[i],
        to: pIds[j],
        visibility: v,
        adjacency: a,
        r_score: v + a
      });
    }
  }

  // 7. Allocation (Simple Rule)
  const floor_assignment = levels.map((lvl, i) => {
    // Distribute programs roughly
    const pCount = programs.length;
    const start = Math.floor((i / levels.length) * pCount);
    const end = Math.floor(((i + 1) / levels.length) * pCount);
    return {
      floor: i + 1,
      program_ids: programs.slice(start, Math.max(start + 1, end)).map(p => p.id)
    };
  });

  // 8. Geometry IR (Placeholder)
  const voids: any[] = [];
  if (grammar.topology.type === "COURTYARD" || grammar.buffer.strategy === "BUFFER_FIELDS") {
    voids.push({
      x: inputs.site_width_m * 0.4,
      y: inputs.site_depth_m * 0.4,
      w: inputs.site_width_m * 0.2,
      h: inputs.site_depth_m * 0.2
    });
  }

  return {
    inputs,
    logic_trace: {
      dc_choices: dcChoices,
      axis_profile: axisProfile,
      applied_rules: [] // Placeholder for rule hits
    },
    computed: {
      site_area_m2,
      footprint_m2,
      gross_floor_area_m2,
      net_program_area_m2,
      levels
    },
    grammar,
    blueprint: {
      programs,
      relations: { edges },
      allocation: { floor_assignment },
      geometry_ir: {
        grid: { cell_mm: 1500 },
        voids,
        zones: [],
        massing: []
      }
    }
  };
}
