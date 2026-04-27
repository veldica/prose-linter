import type { CheckResult, RevisionLeverDefinition, ImpactScope } from "./types.js";
import { REVISION_LEVER_CATALOG } from "./catalog.js";

function round(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

export interface RankedLever {
  lever: string;
  label: string;
  rank: number;
  score: number;
  priority: "high" | "medium" | "low";
  explanation: string;
  evidence: string[];
  affected_metrics: string[];
  affected_formulas: string[];
  impact_scope: ImpactScope;
  effort: "low" | "medium";
}

interface LeverAccumulator {
  score: number;
  evidence: Set<string>;
  affected_metrics: Set<string>;
  affected_formulas: Set<string>;
  scope_rank: number;
}

const SCOPE_RANK = {
  localized: 1,
  distributed: 2,
  global: 3,
} as const;

export function rankRevisionLevers(
  stats: any,
  formulas: any[],
  allChecks: CheckResult[] = []
): RankedLever[] {
  const accumulators = new Map<string, LeverAccumulator>();

  for (const check of allChecks) {
    if (check.status !== "failed") continue;

    for (const lever of check.revision_levers) {
      const definition = REVISION_LEVER_CATALOG[lever];
      if (!definition) continue;

      const accumulator = getAccumulator(accumulators, lever);
      const scopeWeight =
        check.impact_scope === "global"
          ? 18
          : check.impact_scope === "distributed"
            ? 10
            : 4;
      const formulaWeight = check.affected_formulas.length * 5;
      const scoreBoost = 40 + check.normalized_gap * 45 + scopeWeight + formulaWeight;

      accumulator.score += scoreBoost + definition.ease_score * 8;
      accumulator.scope_rank = Math.max(accumulator.scope_rank, SCOPE_RANK[check.impact_scope]);
      accumulator.affected_metrics.add(check.metric);
      check.affected_formulas.forEach((f) => accumulator.affected_formulas.add(f));
      accumulator.evidence.add(check.message);
    }
  }

  addHeuristicLevers(accumulators, stats, formulas);

  return Array.from(accumulators.entries())
    .map(([lever, accumulator]) => {
      const definition = REVISION_LEVER_CATALOG[lever];
      const score = round(accumulator.score, 2);
      const impactScope = reverseScopeRank(accumulator.scope_rank);
      const priority: RankedLever["priority"] =
        score >= 70 ? "high" : score >= 35 ? "medium" : "low";

      return {
        lever,
        label: definition.label,
        rank: 0,
        score,
        priority,
        explanation: definition.description,
        evidence: Array.from(accumulator.evidence).sort(),
        affected_metrics: Array.from(accumulator.affected_metrics).sort(),
        affected_formulas: Array.from(accumulator.affected_formulas).sort(),
        impact_scope: impactScope,
        effort: definition.effort,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.affected_formulas.length !== left.affected_formulas.length) 
        return right.affected_formulas.length - left.affected_formulas.length;
      return left.lever.localeCompare(right.lever);
    })
    .map((lever, index) => ({
      ...lever,
      rank: index + 1,
    }));
}

function addHeuristicLevers(
  accumulators: Map<string, LeverAccumulator>,
  stats: any,
  formulas: any[]
) {
  const difficultFormulaMetrics = formulas
    .filter((f) => f.applicable && f.score >= 12 && f.metric !== "flesch_reading_ease" && f.metric !== "type_token_ratio")
    .map((f) => f.metric);

  if (
    stats.sentence_metrics.avg_words_per_sentence > 18 ||
    stats.sentence_metrics.percent_sentences_over_20_words > 0.25
  ) {
    boostLever(
      accumulators,
      "shorten_long_sentences",
      22 + stats.sentence_metrics.avg_words_per_sentence,
      "Sentence length is a strong mechanical driver in this draft.",
      ["avg_words_per_sentence", "percent_sentences_over_20_words"],
      difficultFormulaMetrics
    );
  }

  if (
    stats.paragraph_metrics.max_words_per_paragraph > 120 ||
    stats.paragraph_metrics.percent_paragraphs_over_100_words > 0.2
  ) {
    boostLever(
      accumulators,
      "split_oversized_paragraphs",
      18 + stats.paragraph_metrics.percent_paragraphs_over_100_words * 50,
      "Dense paragraph blocks are reducing scan-ability.",
      ["max_words_per_paragraph", "percent_paragraphs_over_100_words"],
      []
    );

    if (stats.counts.heading_count === 0 && stats.counts.list_item_count === 0) {
      boostLever(
        accumulators,
        "add_breaks_to_dense_sections",
        18,
        "The text has wall-of-text sections without structural breaks.",
        ["heading_count", "list_item_count", "max_words_per_paragraph"],
        []
      );

      boostLever(
        accumulators,
        "increase_heading_frequency",
        15,
        "Headings would improve navigational ease.",
        ["heading_density", "words_per_heading"],
        []
      );
    }
  }

  if (stats.scannability.paragraph_scannability_score < 60) {
    boostLever(
      accumulators,
      "introduce_lists_for_scannability",
      20,
      "Lists would help break down information for faster skimming.",
      ["list_density", "paragraph_scannability_score"],
      []
    );
  }

  if (stats.sentence_metrics.sentence_length_p95 > 35) {
    boostLever(
      accumulators,
      "break_sentence_tails",
      15 + (stats.sentence_metrics.sentence_length_p95 - 30),
      "Significant 'sentence-tail' risk detected in long sentences.",
      ["sentence_length_p95", "sentence_length_p90"],
      ["flesch_kincaid_grade_level", "gunning_fog"]
    );
  }

  if (stats.fiction && stats.fiction.dialogue_ratio > 0.01) {
    if (stats.fiction.scene_density_proxy < 0.4) {
      boostLever(
        accumulators,
        "tighten_scene_pacing",
        15 + (0.4 - stats.fiction.scene_density_proxy) * 50,
        "Scene momentum is low; increasing shorter sentence frequency would improve pacing.",
        ["scene_density_proxy", "avg_words_per_sentence"],
        []
      );
    }

    if (stats.fiction.narration_vs_dialogue_balance !== "balanced") {
      boostLever(
        accumulators,
        "improve_dialogue_balance",
        12,
        `Current narrative balance is ${stats.fiction.narration_vs_dialogue_balance.replace("_", " ")}; adjusting dialogue frequency may improve flow.`,
        ["dialogue_ratio", "narration_vs_dialogue_balance"],
        []
      );
    }

    if (stats.fiction.sensory_term_density < 0.015) {
      boostLever(
        accumulators,
        "ground_with_sensory_details",
        14,
        "Low density of sensory details (visual, auditory, tactile) detected; consider 'showing' more through specific imagery.",
        ["sensory_term_density"],
        []
      );
    }

    if (stats.fiction.abstract_word_ratio > 0.04) {
      boostLever(
        accumulators,
        "reduce_abstract_wording",
        12 + stats.fiction.abstract_word_ratio * 100,
        "High reliance on abstract concepts (truth, justice, system) rather than concrete narrative actions.",
        ["abstract_word_ratio"],
        []
      );
    }
  }
}

function boostLever(
  accumulators: Map<string, LeverAccumulator>,
  lever: string,
  scoreBoost: number,
  evidence: string,
  metrics: string[],
  formulas: string[]
) {
  const definition = REVISION_LEVER_CATALOG[lever];
  if (!definition) return;
  const accumulator = getAccumulator(accumulators, lever);
  accumulator.score += scoreBoost + definition.ease_score * 6;
  accumulator.scope_rank = Math.max(accumulator.scope_rank, 2);
  accumulator.evidence.add(evidence);
  metrics.forEach((m) => accumulator.affected_metrics.add(m));
  formulas.forEach((f) => accumulator.affected_formulas.add(f));
}

function getAccumulator(
  accumulators: Map<string, LeverAccumulator>,
  lever: string
): LeverAccumulator {
  const existing = accumulators.get(lever);
  if (existing) return existing;

  const def = REVISION_LEVER_CATALOG[lever];
  const created: LeverAccumulator = {
    score: 0,
    evidence: new Set<string>(),
    affected_metrics: new Set<string>(def?.affected_metrics ?? []),
    affected_formulas: new Set<string>(def?.affected_formulas ?? []),
    scope_rank: 1,
  };
  accumulators.set(lever, created);
  return created;
}

function reverseScopeRank(scopeRank: number): ImpactScope {
  if (scopeRank >= SCOPE_RANK.global) return "global";
  if (scopeRank >= SCOPE_RANK.distributed) return "distributed";
  return "localized";
}
