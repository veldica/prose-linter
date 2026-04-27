import { tokenizeProse } from "@veldica/prose-tokenizer";
import { runAllFormulas } from "@veldica/readability";
import { analyzeLexical, analyzeNarrative } from "@veldica/prose-analyzer";
import { checkViolations, summarizeCompliance } from "./engine.js";
import { calculateFit, type FitResult } from "./fit.js";
import { rankRevisionLevers, type RankedLever } from "./ranking.js";
import type { StyleProfile, CheckResult, ComplianceSummary, AIAnalysis, AIMarkerMatch, Severity } from "./types.js";
import { AI_MARKERS, DOCUMENT_SIGNALS } from "./catalog.js";

export * from "./types.js";
export * from "./engine.js";
export * from "./fit.js";
export * from "./ranking.js";
export * from "./catalog.js";

export interface FullLintResult {
  stats: {
    counts: Record<string, number>;
    sentence_metrics: Record<string, number>;
    paragraph_metrics: Record<string, number>;
    lexical: any;
    scannability: Record<string, number | null>;
    fiction: any;
    word_tracking: Record<string, number>;
  };
  analysis: {
    formulas: any[];
  };
  checks: CheckResult[];
  violations: CheckResult[];
  skipped_checks: CheckResult[];
  summary: ComplianceSummary;
  revision_levers: RankedLever[];
  fit: FitResult;
  ai_analysis?: AIAnalysis;
}

function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

function getMax(values: number[]): number {
  if (values.length === 0) return 0;
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) max = values[i];
  }
  return max === -Infinity ? 0 : max;
}

function getMin(values: number[]): number {
  if (values.length === 0) return 0;
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) min = values[i];
  }
  return min === Infinity ? 0 : min;
}

function getNewLineOffsets(text: string): number[] {
    const offsets: number[] = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n") offsets.push(i);
    }
    return offsets;
}

function getLocationOptimized(offset: number, newlineOffsets: number[]) {
    // Binary search for the last newline before offset
    let low = 0;
    let high = newlineOffsets.length - 1;
    let lastNewlineIndex = -1;
    let line = 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (newlineOffsets[mid] < offset) {
            lastNewlineIndex = newlineOffsets[mid];
            line = mid + 2; // Line index is 0-based offset + 1, and first line has no preceding newline
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return {
        line,
        column: offset - lastNewlineIndex
    };
}

/**
 * Audits a document specifically for "AI-ish" patterns and stylistic markers.
 * 
 * This function performs a lightweight analysis focused on lexical choices, 
 * stock phrases, and structural patterns typical of LLM-generated output.
 * 
 * @param text - The raw English prose to analyze.
 * @param options - Configuration for the inventory.
 * @param options.track_ai_patterns - Whether to search for default AI markers (default: true).
 * @param options.track_words - Additional specific words or phrases to locate.
 * @param options.include_document_signals - Whether to perform structural document-level checks (default: true).
 * @returns A detailed AIAnalysis report including match locations and density scores.
 */
export function inventoryMarkers(
  text: string, 
  options: { 
    track_ai_patterns?: boolean; 
    track_words?: string[]; 
    fiction?: any; 
    tokenized?: any;
    include_document_signals?: boolean;
  } = {}
): AIAnalysis {
    if (typeof text !== "string") {
        throw new Error("Veldica.inventoryMarkers: 'text' must be a string.");
    }
    const ai_matches: AIMarkerMatch[] = [];
    const ai_categories: Record<string, number> = {};
    let total_ai_markers = 0;
    const unique_patterns = new Set<string>();

    const text_to_analyze = text;
    // Default to true if not specified
    const track_ai = options.track_ai_patterns !== false;
    const include_document = options.include_document_signals !== false;

    const newlineOffsets = getNewLineOffsets(text_to_analyze);

    if (options.track_words) {
        for (const pattern of options.track_words) {
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(?<!\\w)${escapedPattern}(?!\\w)`, "gi");
            let match;
            while ((match = regex.exec(text_to_analyze)) !== null) {
                const loc = getLocationOptimized(match.index, newlineOffsets);
                ai_matches.push({
                    pattern,
                    matched_text: match[0],
                    category: "tracked_word",
                    severity: "medium",
                    scope: "localized",
                    offset: match.index,
                    line: loc.line,
                    column: loc.column
                });
                unique_patterns.add(pattern);
                total_ai_markers++;
                ai_categories["tracked_word"] = (ai_categories["tracked_word"] || 0) + 1;
            }
        }
    }

    if (track_ai) {
        for (const marker of AI_MARKERS) {
            // Avoid double-counting if already tracked as a word
            if (options.track_words?.includes(marker.pattern)) continue;

            const wildcardPlaceholder = "___VELDICA_WILDCARD___";
            let processedPattern = marker.pattern.replace(/\*/g, wildcardPlaceholder);
            
            let regexStr = processedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            regexStr = regexStr.replace(new RegExp(wildcardPlaceholder, "g"), ".*?");
            
            const startBoundary = /^\w/.test(marker.pattern) ? "(?<!\\w)" : "";
            const endBoundary = /\w$/.test(marker.pattern) ? "(?!\\w)" : "";
            
            const regex = new RegExp(`${startBoundary}${regexStr}${endBoundary}`, "gi");
            let match;
            while ((match = regex.exec(text_to_analyze)) !== null) {
                const loc = getLocationOptimized(match.index, newlineOffsets);
                ai_matches.push({
                    pattern: marker.pattern,
                    matched_text: match[0],
                    category: marker.category,
                    severity: marker.severity as Severity,
                    scope: "localized",
                    offset: match.index,
                    line: loc.line,
                    column: loc.column
                });
                unique_patterns.add(marker.pattern);
                total_ai_markers++;
                ai_categories[marker.category] = (ai_categories[marker.category] || 0) + 1;
            }
        }

        const word_count = text_to_analyze.split(/\s+/).filter(Boolean).length || 1;
        
        // Specificity Check
        const numberMatches = text_to_analyze.match(/\d+/g);
        const numberCount = numberMatches ? numberMatches.length : 0;
        
        // If fiction metrics are missing, we might want to calculate them if include_document is on
        let fiction = options.fiction;
        let tokenized = options.tokenized;

        if (include_document && (!fiction || !tokenized)) {
            tokenized = tokenized || tokenizeProse(text_to_analyze);
            if (!fiction) {
                const sentencesRaw = tokenized.sentences;
                const wordsRaw = tokenized.words;
                const paragraphsRaw = tokenized.paragraphs;
                const paragraphWordCounts = paragraphsRaw.map((p: string) => p.split(/\s+/).filter(Boolean).length);
                const sentenceWordCounts = sentencesRaw.map((s: string) => s.split(/\s+/).filter(Boolean).length);
                fiction = analyzeNarrative(sentencesRaw, wordsRaw, sentenceWordCounts, paragraphWordCounts);
            }
        }

        const looksLikeLiterature = (fiction?.dialogue_ratio > 0.05);
        if (word_count >= 50 && !looksLikeLiterature && total_ai_markers > 0 && numberCount < (word_count / 250)) {
            const sig = DOCUMENT_SIGNALS.find(s => s.id === "specificity_deficit")!;
            ai_matches.push({
                pattern: sig.name,
                matched_text: "Low density of numbers/data",
                category: sig.category,
                severity: sig.severity,
                scope: "document",
                offset: null,
                line: null,
                column: null
            });
            total_ai_markers++;
            ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
        }

        if (include_document && tokenized) {
            // Skeleton Check
            const headings = tokenized.blocks.filter((b: any) => b.kind === "heading").map((b: any) => b.text);
            const headingText = headings.join(" ").toLowerCase();
            const commonAISubjectHeadings = ["introduction", "what is", "why matters", "benefits of", "conclusion"];
            let skeletonMatches = 0;
            for (const h of commonAISubjectHeadings) {
                if (headingText.includes(h)) skeletonMatches++;
            }
            if (skeletonMatches >= 3) {
                const sig = DOCUMENT_SIGNALS.find(s => s.id === "ai_skeleton")!;
                ai_matches.push({
                    pattern: sig.name,
                    matched_text: "Common AI article skeleton",
                    category: sig.category,
                    severity: sig.severity,
                    scope: "document",
                    offset: null,
                    line: null,
                    column: null
                });
                total_ai_markers++;
                ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
            }

            // Paragraph Symmetry
            const paragraphsWith3to5Sentences = tokenized.blocks
                .filter((b: any) => b.kind === "paragraph")
                .map((b: any) => {
                    // count sentences in this block
                    const sentences = tokenized.sentences.filter((s: string) => b.text.includes(s));
                    return sentences.length;
                })
                .filter((count: number) => count >= 3 && count <= 5).length;
            const totalParagraphs = tokenized.counts.paragraph_count || 1;
            if (totalParagraphs >= 3 && (paragraphsWith3to5Sentences / totalParagraphs) > 0.8) {
                const sig = DOCUMENT_SIGNALS.find(s => s.id === "paragraph_symmetry")!;
                ai_matches.push({
                    pattern: sig.name,
                    matched_text: "High paragraph symmetry (3-5 sentences each)",
                    category: sig.category,
                    severity: sig.severity,
                    scope: "document",
                    offset: null,
                    line: null,
                    column: null
                });
                total_ai_markers++;
                ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
            }

            // Repeated Sentence Starts
            const commonAIStarts = ["this helps", "this allows", "this enables", "it ensures", "it provides"];
            const startsFound: Record<string, number> = {};
            for (const s of tokenized.sentences) {
                const lowerS = s.toLowerCase().trim();
                for (const start of commonAIStarts) {
                    if (lowerS.startsWith(start)) {
                        startsFound[start] = (startsFound[start] || 0) + 1;
                    }
                }
            }
            for (const [start, count] of Object.entries(startsFound)) {
                if (count >= 2) {
                    const sig = DOCUMENT_SIGNALS.find(s => s.id === "repeated_starts")!;
                    ai_matches.push({
                        pattern: `${sig.name}: "${start}"`,
                        matched_text: start,
                        category: sig.category,
                        severity: sig.severity,
                        scope: "document",
                        offset: null,
                        line: null,
                        column: null
                    });
                    total_ai_markers++;
                    ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
                }
            }
        }

        // Bold Lead-ins
        const boldLeadInMatches = text_to_analyze.match(/\*\*[^*]+:\*\*/g);
        if (boldLeadInMatches && boldLeadInMatches.length >= 3) {
            const sig = DOCUMENT_SIGNALS.find(s => s.id === "bold_leadins")!;
            ai_matches.push({
                pattern: sig.name,
                matched_text: "Repetitive bold lead-in pattern",
                category: sig.category,
                severity: sig.severity,
                scope: "document",
                offset: null,
                line: null,
                column: null
            });
            total_ai_markers++;
            ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
        }

        // Rule of Three (Triads)
        const triadMatches = text_to_analyze.match(/\b\w+, \w+, (?:and|or) \w+\b/g);
        if (triadMatches && triadMatches.length >= 2) {
            const sig = DOCUMENT_SIGNALS.find(s => s.id === "triads")!;
            ai_matches.push({
                pattern: sig.name,
                matched_text: "Frequent use of triads (Rule of Three)",
                category: sig.category,
                severity: sig.severity,
                scope: "document",
                offset: null,
                line: null,
                column: null
            });
            total_ai_markers++;
            ai_categories[sig.category] = (ai_categories[sig.category] || 0) + 1;
        }
    }

    // Weighted AI Score and Density
    const WEIGHTS: Record<string, number> = {
        assistant_residue: 10,
        stock_phrases: 5,
        sentence_patterns: 4,
        generic_claims: 3,
        vocabulary_high: 3,
        vocabulary_medium: 2,
        vocabulary_low: 1,
        style_marker: 0.5,
        tracked_word: 0
    };

    // Add weights from document signals
    for (const sig of DOCUMENT_SIGNALS) {
        if (!WEIGHTS[sig.category]) {
            WEIGHTS[sig.category] = sig.severity === "high" ? 5 : (sig.severity === "medium" ? 3 : 1);
        }
    }

    let ai_score = 0;
    let density_contributing_markers = 0;
    for (const match of ai_matches) {
        let key = match.category;
        if (match.category === "vocabulary") {
            key = `vocabulary_${match.severity}`;
        }
        ai_score += (WEIGHTS[key] || 1);
        density_contributing_markers += (match.category === "style_marker" ? 0.2 : 1);
    }

    const word_count = text_to_analyze.split(/\s+/).filter(Boolean).length || 1;
    const density = (density_contributing_markers / word_count) * 1000;
    
    let style_band: "low" | "moderate" | "high" | "very_high" = "low";
    if (density > 40) style_band = "very_high";
    else if (density > 20) style_band = "high";
    else if (density > 7) style_band = "moderate";

    return {
        marker_count: total_ai_markers,
        unique_marker_types: unique_patterns.size,
        marker_density_per_1000_words: density,
        score: ai_score,
        style_band,
        categories: ai_categories,
        matches: ai_matches
    };
}

/**
 * The primary entry point for the Veldica Prose Linter.
 * 
 * Performs full structural, complexity, and stylistic analysis, then evaluates 
 * the results against a StyleProfile to identify violations and revision levers.
 * 
 * @param text - The raw English prose to analyze.
 * @param profile - The StyleProfile defining targets and tracking options.
 * @returns A comprehensive FullLintResult including stats, violations, and AI analysis.
 */
export function lintText(text: string, profile: StyleProfile): FullLintResult {
  if (typeof text !== "string") {
    throw new Error("Veldica.lintText: 'text' must be a string.");
  }
  if (!profile || typeof profile !== "object") {
    throw new Error("Veldica.lintText: 'profile' must be a valid StyleProfile object.");
  }
  // 1. Structural Tokenization
  const tokenized = tokenizeProse(text);
  
  // 2. Metrics Extraction
  const wordsRaw = tokenized.words;
  const sentencesRaw = tokenized.sentences;
  const paragraphsRaw = tokenized.paragraphs;
  const paragraphWordCounts = paragraphsRaw.map(p => p.split(/\s+/).filter(Boolean).length);
  const sentenceWordCounts = sentencesRaw.map(s => s.split(/\s+/).filter(Boolean).length);
  const word_count_actual = tokenized.counts.word_count || 1;

  const lexical = analyzeLexical(wordsRaw);
  const fiction = analyzeNarrative(sentencesRaw, wordsRaw, sentenceWordCounts, paragraphWordCounts);

  // AI Analysis (using improved inventoryMarkers)
  const ai_analysis = (profile.track_ai_patterns || (profile.track_words && profile.track_words.length > 0)) 
    ? inventoryMarkers(text, { 
        track_ai_patterns: profile.track_ai_patterns,
        track_words: profile.track_words,
        fiction,
        tokenized
      }) : undefined;

  // Build enhanced stats object
  const stats = {
    counts: {
      ...tokenized.counts,
      unique_word_count: lexical.unique_word_count,
    },
    sentence_metrics: {
        avg_words_per_sentence: sentencesRaw.length > 0 ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentencesRaw.length : 0,
        median_words_per_sentence: getPercentile(sentenceWordCounts, 50),
        max_words_per_sentence: getMax(sentenceWordCounts),
        min_words_per_sentence: getMin(sentenceWordCounts),
        sentence_length_p90: getPercentile(sentenceWordCounts, 90),
        sentence_length_p95: getPercentile(sentenceWordCounts, 95),
        sentence_length_stddev: getStdDev(sentenceWordCounts),
        sentences_over_20_words: sentenceWordCounts.filter(c => c > 20).length,
        sentences_over_25_words: sentenceWordCounts.filter(c => c > 25).length,
        sentences_over_30_words: sentenceWordCounts.filter(c => c > 30).length,
        sentences_over_40_words: sentenceWordCounts.filter(c => c > 40).length,
        percent_sentences_over_20_words: sentencesRaw.length > 0 ? sentenceWordCounts.filter(c => c > 20).length / sentencesRaw.length : 0,
        percent_sentences_over_25_words: sentencesRaw.length > 0 ? sentenceWordCounts.filter(c => c > 25).length / sentencesRaw.length : 0,
        percent_sentences_over_30_words: sentencesRaw.length > 0 ? sentenceWordCounts.filter(c => c > 30).length / sentencesRaw.length : 0,
        percent_sentences_over_40_words: sentencesRaw.length > 0 ? sentenceWordCounts.filter(c => c > 40).length / sentencesRaw.length : 0,
    },
    paragraph_metrics: {
        avg_words_per_paragraph: paragraphsRaw.length > 0 ? paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphsRaw.length : 0,
        median_words_per_paragraph: getPercentile(paragraphWordCounts, 50),
        max_words_per_paragraph: getMax(paragraphWordCounts),
        min_words_per_paragraph: getMin(paragraphWordCounts),
        paragraph_length_p90: getPercentile(paragraphWordCounts, 90),
        paragraph_length_p95: getPercentile(paragraphWordCounts, 95),
        paragraph_length_stddev: getStdDev(paragraphWordCounts),
        paragraphs_over_75_words: paragraphWordCounts.filter(c => c > 75).length,
        paragraphs_over_100_words: paragraphWordCounts.filter(c => c > 100).length,
        paragraphs_over_150_words: paragraphWordCounts.filter(c => c > 150).length,
        percent_paragraphs_over_75_words: paragraphsRaw.length > 0 ? paragraphWordCounts.filter(c => c > 75).length / paragraphsRaw.length : 0,
        percent_paragraphs_over_100_words: paragraphsRaw.length > 0 ? paragraphWordCounts.filter(c => c > 100).length / paragraphsRaw.length : 0,
        percent_paragraphs_over_150_words: paragraphsRaw.length > 0 ? paragraphWordCounts.filter(c => c > 150).length / paragraphsRaw.length : 0,
        avg_sentences_per_paragraph: paragraphsRaw.length > 0 ? sentencesRaw.length / paragraphsRaw.length : 0,
    },
    lexical: {
        ...lexical,
        avg_characters_per_word: word_count_actual > 0 ? (text.length / word_count_actual) : 0, // Simplified but better than missing
    },
    scannability: {
        heading_density: tokenized.counts.heading_count / (word_count_actual / 100 || 1),
        list_density: tokenized.counts.list_item_count / (word_count_actual / 100 || 1),
        words_per_heading: tokenized.counts.heading_count > 0 ? word_count_actual / tokenized.counts.heading_count : null,
        words_between_breaks: word_count_actual / (tokenized.counts.heading_count + tokenized.counts.paragraph_count || 1),
        paragraph_scannability_score: paragraphsRaw.length > 0 ? 100 - (paragraphWordCounts.filter(c => c > 100).length / paragraphsRaw.length * 100) : 100,
        sentence_tail_risk_score: sentencesRaw.length > 0 ? (sentenceWordCounts.filter(c => c > 30).length / sentencesRaw.length * 100) : 0,
    },
    fiction,
    word_tracking: {} as Record<string, number>, 
    sentences: [], 
    paragraphs: []
  };

  // Populate word tracking for stats
  if (profile.track_words) {
      for (const pattern of profile.track_words) {
          stats.word_tracking[pattern] = 0;
      }
  }

  if (ai_analysis) {
      for (const match of ai_analysis.matches) {
          stats.word_tracking[match.pattern] = (stats.word_tracking[match.pattern] || 0) + 1;
      }
  }


  // 3. Complexity Analysis
  const analysis = runAllFormulas(stats as any);

  // 4. Violation Detection
  const allChecks = checkViolations(stats, analysis.formulas, profile);
  
  // 5. Fit & Scoring
  const fit = calculateFit(stats, analysis.formulas, profile);
  const summary = summarizeCompliance(profile, allChecks, fit.score);

  // 6. Actionable Advice
  const revision_levers = rankRevisionLevers(stats, analysis.formulas, allChecks);

  return {
    stats,
    analysis,
    checks: allChecks,
    violations: allChecks.filter(c => c.status === "failed"),
    skipped_checks: allChecks.filter(c => c.status === "skipped"),
    summary,
    revision_levers,
    fit,
    ai_analysis
  };
}
