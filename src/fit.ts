import type { StyleProfile, TargetValue } from "./types.js";

export interface FitResult {
  score: number;
  label: "very_low" | "low" | "fair" | "good" | "excellent";
  strongest_alignments: string[];
  strongest_mismatches: string[];
  interpretation: string;
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function round(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

const METRIC_LABELS: Record<string, string> = {
  word_count: "Word count",
  avg_words_per_sentence: "Sentence length (avg)",
  median_words_per_sentence: "Sentence length (median)",
  max_words_per_sentence: "Sentence length (max)",
  sentence_length_p90: "Sentence length (P90)",
  sentence_length_p95: "Sentence length (P95)",
  sentence_length_stddev: "Sentence length variation",
  percent_sentences_over_20_words: "Long sentence share",
  percent_sentences_over_30_words: "Very long sentence share",
  avg_words_per_paragraph: "Paragraph length (avg)",
  max_words_per_paragraph: "Paragraph length (max)",
  paragraph_length_p90: "Paragraph length (P90)",
  paragraph_length_p95: "Paragraph length (P95)",
  lexical_diversity_ttr: "Vocabulary variety (TTR)",
  lexical_diversity_mattr: "Vocabulary variety (MATTR)",
  lexical_density: "Lexical density",
  repetition_ratio: "Repetition",
  avg_characters_per_word: "Average characters per word",
  avg_syllables_per_word: "Average syllables per word",
  long_word_ratio: "Long-word density",
  difficult_word_ratio: "Vocabulary difficulty",
  complex_word_ratio: "Complex word density",
  heading_density: "Heading density",
  list_density: "List density",
  paragraph_scannability_score: "Paragraph scannability",
  sentence_tail_risk_score: "Sentence tail risk",
  dialogue_ratio: "Dialogue balance",
  scene_density_proxy: "Scene density",
  exposition_density_proxy: "Exposition density",
  sensory_term_density: "Sensory grounding",
  abstract_word_ratio: "Abstract wording",
};

export function calculateFit(
  stats: any,
  formulaResults: any[],
  profile: StyleProfile
): FitResult {
  let totalScore = 0;
  let totalWeight = 0;
  const alignments: string[] = [];
  const mismatches: string[] = [];
  const targets = profile.targets || {};

  const check = (
    current: number,
    target: TargetValue,
    weight: number,
    name: string
  ) => {
    totalWeight += weight;
    const pass = target.operator === "at_least" ? current >= target.value : current <= target.value;
    if (pass) {
      totalScore += weight;
      alignments.push(name);
      return;
    }
    const gap = Math.abs(current - target.value);
    const normalizedGap = safeDivide(gap, target.value || 1);
    const penalty = Math.max(0, weight * (1 - normalizedGap));
    totalScore += penalty;
    mismatches.push(name);
  };

  const checkGroup = (group: keyof StyleProfile["targets"], currentValues: any, baseWeight: number) => {
    const targetGroup = targets[group];
    if (!targetGroup) return;

    for (const [metric, target] of Object.entries(targetGroup)) {
      const current = currentValues[metric];
      if (current === undefined || current === null) continue;
      
      let weight = baseWeight;
      if (metric.includes("_p9") || metric.startsWith("max_")) weight *= 0.8;
      if (metric.includes("percent_") || metric.endsWith("_ratio")) weight *= 0.7;
      if (metric.includes("stddev") || metric.includes("variation")) weight *= 0.5;
      if (metric.includes("score")) weight *= 0.8;

      check(current, target, weight, METRIC_LABELS[metric] ?? metric);
    }
  };

  checkGroup("counts", stats.counts, 4);
  checkGroup("sentence_metrics", stats.sentence_metrics, 10);
  checkGroup("paragraph_metrics", stats.paragraph_metrics, 8);
  checkGroup("lexical_metrics", stats.lexical, 12);
  checkGroup("scannability_metrics", stats.scannability, 10);
  checkGroup("word_tracking_metrics", stats.word_tracking, 10);
  if (stats.fiction) checkGroup("fiction_metrics", stats.fiction, 15);

  if (targets.formulas) {
    const formulaValues: Record<string, number> = {};
    formulaResults.forEach((f) => (formulaValues[f.metric] = f.score));
    const formulaNames: Record<string, string> = {};
    formulaResults.forEach((f) => (formulaNames[f.metric] = f.name));

    for (const [metric, target] of Object.entries(targets.formulas)) {
        const current = formulaValues[metric];
        if (current !== undefined) {
            check(current, target, 15, formulaNames[metric] ?? metric);
        }
    }
  }

  const finalScore = totalWeight > 0 ? round((totalScore / totalWeight) * 100, 0) : 100;

  let label: FitResult["label"] = "fair";
  if (finalScore >= 90) label = "excellent";
  else if (finalScore >= 75) label = "good";
  else if (finalScore >= 50) label = "fair";
  else if (finalScore >= 25) label = "low";
  else label = "very_low";

  const targetName = profile.name ? `the '${profile.name}' profile` : "the target profile";
  let interpretation = `This text is a ${label.replace("_", " ")} match for ${targetName}.`;
  if (mismatches.length > 0) {
    interpretation += ` Primary adjustments needed in: ${mismatches.slice(0, 3).join(", ")}.`;
  } else if (totalWeight > 0) {
    interpretation += " It aligns well with the desired profile.";
  }

  return {
    score: finalScore,
    label,
    strongest_alignments: alignments.slice(0, 3),
    strongest_mismatches: mismatches.slice(0, 3),
    interpretation,
  };
}
