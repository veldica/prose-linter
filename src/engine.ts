import type { 
  CheckResult, 
  StyleProfile, 
  ComplianceSummary, 
  ImpactScope, 
  Severity,
  TargetValue 
} from "./types.js";
import { METRIC_LEVERS, METRIC_FORMULAS } from "./catalog.js";

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  return numerator / denominator;
}

function round(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) return 0;
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

export function checkViolations(
  stats: any, // StructuralMetrics from @veldica/prose-analyzer
  formulaResults: any[], // FormulaResult[] from @veldica/readability
  profile: StyleProfile
): CheckResult[] {
  const allChecks: CheckResult[] = [];
  const targets = profile.targets || {};
  let totalProcessedTargets = 0;
  const MAX_TARGETS = 100; // Strict cap to prevent Payload Poisoning / DoS

  const checkGroup = (
    group: keyof StyleProfile["targets"],
    currentValues: any,
    defaultScope: ImpactScope
  ) => {
    const targetGroup = targets[group];
    if (!targetGroup) return;

    for (const [metric, target] of Object.entries(targetGroup)) {
      if (totalProcessedTargets >= MAX_TARGETS) break;
      totalProcessedTargets++;

      const current = currentValues[metric];
      
      // Sanitize target value to ensure it's a finite number
      const targetVal = Number.isFinite(target?.value) ? target.value : 0;
      
      if (current === undefined || current === null || (typeof current === "number" && !Number.isFinite(current))) {
        allChecks.push({
          ruleId: `${group.replace("_metrics", "")}-${metric.replace(/_/g, "-")}`,
          metric,
          metric_group: group,
          current_value: 0,
          target_value: round(targetVal),
          pass: false,
          status: "skipped",
          severity: "low",
          message: `${metric} could not be evaluated (data missing or invalid).`,
          explanation: `The metric ${metric} is not present or returned non-finite in the current analysis context.`,
          revision_levers: [],
          normalized_gap: 0,
          affected_formulas: [],
          impact_scope: defaultScope,
          rank_score: 0,
        });
        continue;
      }

      const pass =
        target.operator === "at_least" ? current >= targetVal : current <= targetVal;
      
      if (!pass) {
        const gap = Math.abs(current - targetVal);
        const normalizedGap = safeDivide(gap, targetVal || 1);

        let severity: Severity = "low";
        if (normalizedGap > 0.4) severity = "high";
        else if (normalizedGap > 0.15) severity = "medium";

        allChecks.push({
          ruleId: `${group.replace("_metrics", "")}-${metric.replace(/_/g, "-")}`,
          metric,
          metric_group: group,
          current_value: round(current),
          target_value: round(targetVal),
          pass: false,
          status: "failed",
          severity,
          message: `${metric} is ${target.operator === "at_least" ? "below" : "above"} the target of ${targetVal}.`,
          explanation: `Violation of ${metric} constraint in ${group}. Current: ${current}, Target: ${targetVal}`,
          revision_levers: leversForMetric(metric, target.operator, group),
          normalized_gap: round(normalizedGap),
          affected_formulas: METRIC_FORMULAS[metric] ?? [],
          impact_scope: scopeForMetric(metric, defaultScope),
          rank_score: round(
            100 +
              normalizedGap * 100 +
              (METRIC_FORMULAS[metric]?.length ?? 0) * 6 +
              scopeWeight(scopeForMetric(metric, defaultScope))
          ),
        });
      } else {
        allChecks.push({
          ruleId: `${group.replace("_metrics", "")}-${metric.replace(/_/g, "-")}`,
          metric,
          metric_group: group,
          current_value: round(current),
          target_value: round(targetVal),
          pass: true,
          status: "passed",
          severity: "low",
          message: "Passed",
          explanation: "",
          revision_levers: [],
          normalized_gap: 0,
          affected_formulas: [],
          impact_scope: defaultScope,
          rank_score: 0
        });
      }
    }
  };

  checkGroup("counts", stats.counts, "global");
  checkGroup("sentence_metrics", stats.sentence_metrics, "distributed");
  checkGroup("paragraph_metrics", stats.paragraph_metrics, "distributed");
  checkGroup("lexical_metrics", stats.lexical, "global");
  checkGroup("scannability_metrics", stats.scannability, "distributed");
  checkGroup("word_tracking_metrics", stats.word_tracking, "distributed");

  if (stats.fiction) {
    checkGroup("fiction_metrics", stats.fiction, "distributed");
  }

  const formulaValues: Record<string, number> = {};
  formulaResults.forEach((f) => (formulaValues[f.metric] = f.score));
  checkGroup("formulas", formulaValues, "global");

  return allChecks.sort((a, b) => b.rank_score - a.rank_score);
}

export function summarizeCompliance(profile: StyleProfile, allChecks: CheckResult[], fitScore: number): ComplianceSummary {
  const checksRun = allChecks.length;
  const passed = allChecks.filter(v => v.status === "passed").length;
  const failed = allChecks.filter(v => v.status === "failed").length;
  const skipped = allChecks.filter(v => v.status === "skipped").length;

  return {
    overall_pass: failed === 0 && skipped === 0,
    score: fitScore,
    checks_run: checksRun,
    passed_checks: passed,
    failed_checks: failed,
    skipped_checks: skipped,
    violation_count: failed,
  };
}

function leversForMetric(metric: string, operator: TargetValue["operator"], group?: string): string[] {
  if (metric === "word_count") {
    return operator === "at_least" ? ["add_more_content"] : ["trim_excess_content"];
  }
  if (group === "word_tracking_metrics") {
    return ["reduce_targeted_word_usage"];
  }
  return METRIC_LEVERS[metric] ?? [];
}

function scopeForMetric(metric: string, fallback: ImpactScope): ImpactScope {
  if (
    metric.startsWith("max_") ||
    metric.includes("_p9") ||
    metric.includes("_over_") ||
    metric === "sentence_tail_risk_score" ||
    metric === "paragraph_scannability_score"
  ) {
    return "localized";
  }
  return fallback;
}

function scopeWeight(scope: ImpactScope): number {
  if (scope === "global") return 18;
  if (scope === "distributed") return 10;
  return 4;
}
