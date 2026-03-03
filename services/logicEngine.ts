
import { DC_LIBRARY, LOGIC_RULES } from "../data/staticData";
import { Checkpoint, OptionStatus, BlockedOption, SelectionState, AxisMap, EngineOption } from "../types";

// Helper: Check if option axes contain all keys/values of the pattern
function matchesPattern(optionAxes: AxisMap | undefined, pattern: AxisMap): boolean {
  if (!optionAxes) return false;
  return Object.entries(pattern).every(([key, value]) => optionAxes[key as keyof AxisMap] === value);
}

// Helper: Calculate match score
function calculateScore(candidate: EngineOption, preference: AxisMap, forbidden: AxisMap): number {
  if (!candidate.engine_axes) return 0;
  
  let score = 0;
  const cAxes = candidate.engine_axes;
  
  // Scoring Preference Matches
  for (const [axis, val] of Object.entries(preference)) {
    const cVal = cAxes[axis as keyof AxisMap];
    if (!cVal) continue;
    
    if (cVal === val) {
      score += 2; // Exact Match
    } else {
      // Check Weak Match
      const weakPairs = LOGIC_RULES.execution_spec.weak_match_pairs.find(p => p.axis === axis)?.pairs;
      if (weakPairs) {
        const isWeak = weakPairs.some(pair => pair.includes(val as string) && pair.includes(cVal));
        if (isWeak) score += 1;
      }
    }
  }

  // Scoring Forbidden Conflicts
  for (const [axis, val] of Object.entries(forbidden)) {
    const cVal = cAxes[axis as keyof AxisMap];
    if (cVal === val) {
      score -= 3; // Hard Conflict penalty
    }
  }

  return score;
}

export function calculateAvailableOptions(currentCheckpoint: Checkpoint, selections: SelectionState): { allowed: OptionStatus[], blocked: BlockedOption[] } {
  const allowed: OptionStatus[] = [];
  const blocked: BlockedOption[] = [];

  // --- DC1: Always return all ---
  if (currentCheckpoint === Checkpoint.DC1) {
    return {
      allowed: DC_LIBRARY.dc1_options.map(o => ({ 
        id: o.id, label: o.label, status: "allowed", warning_reason: null, display_tags: o.display_tags 
      })),
      blocked: []
    };
  }

  // --- Shortlisting Phase (DC2 & DC5) ---
  if (currentCheckpoint === Checkpoint.DC2 || currentCheckpoint === Checkpoint.DC5) {
    if (!selections.dc1_id) return { allowed: [], blocked: [] };
    const dc1 = DC_LIBRARY.dc1_options.find(o => o.id === selections.dc1_id);
    if (!dc1 || !dc1.bias_axis_pref || !dc1.anti_axis_forbid) return { allowed: [], blocked: [] };

    const targetLibrary: EngineOption[] = currentCheckpoint === Checkpoint.DC2 
      ? DC_LIBRARY.dc2_types.map(o => ({ ...o, id: o.type })) 
      : DC_LIBRARY.dc5_types.map(o => ({ ...o, id: o.type }));

    const scoredOptions = targetLibrary.map(opt => {
      const score = calculateScore(opt, dc1.bias_axis_pref!, dc1.anti_axis_forbid!);
      return { ...opt, score };
    });

    scoredOptions.sort((a, b) => b.score - a.score);

    scoredOptions.forEach(opt => {
      let isBlocked = false;
      let reason = "";

      // Check Combo Rules for DC5
      if (currentCheckpoint === Checkpoint.DC5 && selections.dc2_type) {
        // Here we check against the single DC2 selection.
        const rule = LOGIC_RULES.exclusion_rules.combo_rules.find(r => 
          r.when.dc2 === selections.dc2_type && r.target_dc5 === opt.id && r.conflict_level === "HARD"
        );
        if (rule) {
          isBlocked = true;
          reason = rule.reason;
        }
      }

      if (isBlocked) {
        blocked.push({ id: opt.id, label: opt.label, blocked_by: ["DC2 Combo"], reason });
      } else if (opt.score < -2) { // Arbitrary cutoff for bad match based on penalty
        blocked.push({ id: opt.id, label: opt.label, blocked_by: ["DC1 Logic"], reason: "DC1에서 설정한 금지 속성과 충돌합니다." });
      } else {
        allowed.push({ 
          id: opt.id, label: opt.label, status: "allowed", warning_reason: null, display_tags: opt.display_tags || [], score: opt.score 
        });
      }
    });

    // Return all valid ones, logic engine will allow multiple selection in UI
    // We limit strictly 'bad' ones but return all neutral/good ones.
    return { allowed: allowed, blocked };
  }

  // --- Filtering Phase (DC3, DC4, DC6, DC7) ---
  let targetLib: EngineOption[] = [];
  let scopeKey: "dc3" | "dc4" | "dc6" | "dc7" | null = null;

  if (currentCheckpoint === Checkpoint.DC3) { targetLib = DC_LIBRARY.dc3_options; scopeKey = "dc3"; }
  if (currentCheckpoint === Checkpoint.DC4) { targetLib = DC_LIBRARY.dc4_options; scopeKey = "dc4"; }
  if (currentCheckpoint === Checkpoint.DC6) { targetLib = DC_LIBRARY.dc6_options; scopeKey = "dc6"; }
  if (currentCheckpoint === Checkpoint.DC7) { targetLib = DC_LIBRARY.dc7_options; scopeKey = "dc7"; }

  if (targetLib.length > 0 && scopeKey) {
    targetLib.forEach(opt => {
      let hardBlockedBy: string[] = [];
      let hardReason = "";
      let softWarnBy: string[] = [];
      let softReason = "";

      // 1. Check DC2 Rules (Single selection)
      if (selections.dc2_type) {
        const rule = LOGIC_RULES.exclusion_rules.dc2_rules.find(r => r.when === selections.dc2_type);
        if (rule) {
          // Hard Patterns
          const hardPatterns = (rule.exclude_hard_axis_patterns as any)[scopeKey!] as AxisMap[] | undefined;
          if (hardPatterns && hardPatterns.some(p => matchesPattern(opt.engine_axes, p))) {
            hardBlockedBy.push("DC2");
            hardReason = rule.rationale;
          }
          // Soft Patterns
          const softPatterns = (rule.exclude_soft_axis_patterns as any)[scopeKey!] as AxisMap[] | undefined;
          if (softPatterns && softPatterns.some(p => matchesPattern(opt.engine_axes, p))) {
            softWarnBy.push("DC2");
            softReason = rule.rationale;
          }
        }
      }

      // 2. Check DC5 Rules (Multiple selection supported - Constraint Synthesis)
      if (selections.dc5_types && selections.dc5_types.length > 0) {
        // Iterate through all selected DC5 types and accumulate exclusion rules
        selections.dc5_types.forEach(dc5Type => {
            const rule = LOGIC_RULES.exclusion_rules.dc5_rules.find(r => r.when === dc5Type);
            if (rule) {
                // Hard Patterns
                const hardPatterns = (rule.exclude_hard_axis_patterns as any)[scopeKey!] as AxisMap[] | undefined;
                if (hardPatterns && hardPatterns.some(p => matchesPattern(opt.engine_axes, p))) {
                    hardBlockedBy.push(`DC5(${dc5Type})`);
                    hardReason = hardReason ? hardReason + " + " + rule.rationale : rule.rationale;
                }
                // Soft Patterns
                const softPatterns = (rule.exclude_soft_axis_patterns as any)[scopeKey!] as AxisMap[] | undefined;
                if (softPatterns && softPatterns.some(p => matchesPattern(opt.engine_axes, p))) {
                    softWarnBy.push(`DC5(${dc5Type})`);
                    softReason = softReason ? softReason + " + " + rule.rationale : rule.rationale;
                }
            }
        });
      }

      if (hardBlockedBy.length > 0) {
        blocked.push({ id: opt.id, label: opt.label, blocked_by: [...new Set(hardBlockedBy)], reason: hardReason });
      } else {
        allowed.push({
          id: opt.id,
          label: opt.label,
          status: softWarnBy.length > 0 ? "warning" : "allowed",
          warning_reason: softWarnBy.length > 0 ? [...new Set(softWarnBy)].join(", ") + ": " + softReason : null,
          display_tags: opt.display_tags || []
        });
      }
    });
  }

  return { allowed, blocked };
}
