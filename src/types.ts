export type Severity = "low" | "medium" | "high";
export type ImpactScope = "localized" | "distributed" | "global";

export interface CheckResult {
  ruleId: string;
  metric: string;
  metric_group: string;
  current_value: number;
  target_value: number;
  pass: boolean;
  status: "passed" | "failed" | "skipped";
  severity: Severity;
  message: string;
  explanation: string;
  revision_levers: string[];
  normalized_gap: number;
  affected_formulas: string[];
  impact_scope: ImpactScope;
  rank_score: number;
  location?: {
    startLine: number;
    endLine: number;
  };
  context?: string;
}

export interface ComplianceSummary {
  overall_pass: boolean;
  score: number;
  checks_run: number;
  passed_checks: number;
  failed_checks: number;
  skipped_checks: number;
  violation_count: number;
}

export interface RevisionLeverDefinition {
  label: string;
  description: string;
  effort: "low" | "medium";
  ease_score: number;
  affected_metrics: string[];
  affected_formulas: string[];
}

export interface TargetValue {
  value: number;
  operator: "at_least" | "at_most";
}

export interface StyleProfile {
  name?: string;
  description?: string;
  targets: {
    counts?: Record<string, TargetValue>;
    sentence_metrics?: Record<string, TargetValue>;
    paragraph_metrics?: Record<string, TargetValue>;
    lexical_metrics?: Record<string, TargetValue>;
    scannability_metrics?: Record<string, TargetValue>;
    fiction_metrics?: Record<string, TargetValue>;
    formulas?: Record<string, TargetValue>;
    word_tracking_metrics?: Record<string, TargetValue>;
  };
  track_words?: string[];
  track_ai_patterns?: boolean;
}

export interface AIMarkerMatch {
  pattern: string;
  matched_text: string;
  category: string;
  severity: Severity;
  scope: "document" | "localized" | "distributed" | "global";
  offset?: number | null;
  line?: number | null;
  column?: number | null;
}

export interface AIAnalysis {
  marker_count: number;
  unique_marker_types: number;
  marker_density_per_1000_words: number;
  score: number;
  style_band: "low" | "moderate" | "high" | "very_high";
  categories: Record<string, number>;
  matches: AIMarkerMatch[];
  word_tracking_metrics: Record<string, number>;
}

export interface DocumentSignal {
  id: string;
  label: string;
  category: string;
  severity: Severity;
  explanation: string;
}

export interface AIMarker {
  pattern: string;
  category: string;
  severity: Severity;
}

export interface ContentAnchor {
  text: string;
  category: "numeric" | "temporal" | "technical" | "lexical" | "fiction" | "other";
  sub_category?: string;
  weight: number;
  context_before: string;
  context_after: string;
  is_negated: boolean;
  offset: number;
}

export interface AnchorComparison {
  text: string;
  category: string;
  original_count: number;
  revised_count: number;
  status: "preserved" | "dropped" | "added" | "changed" | "polarity_shift";
  weight: number;
  original_contexts: string[];
  revised_contexts: string[];
}

export interface ContentIntegrityReport {
  integrity_score: number;
  anchor_recall: number;
  weighted_anchor_recall: number;
  new_anchor_rate: number;
  polarity_shift_count: number;
  anchors: AnchorComparison[];
}

export interface IntegrityOptions {
  aliases?: Record<string, string[]>;
  track_fiction?: boolean;
}
