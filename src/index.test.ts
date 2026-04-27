import { describe, it } from "node:test";
import assert from "node:assert";
import { lintText, inventoryMarkers } from "./index.js";

describe("Prose Linter", () => {
  it("detects basic structural checks", () => {
    const text = "This is a very long sentence that should ideally be flagged by the linter because it exceeds the maximum word count specified in our style profile contract for this test case.";
    const profile = {
      name: "Short Sentences",
      targets: {
        sentence_metrics: {
          avg_words_per_sentence: { value: 10, operator: "at_most" }
        }
      }
    };

    const result = lintText(text, profile);
    
    assert.strictEqual(result.summary.overall_pass, false);
    assert.ok(result.checks.length > 0);
    assert.ok(result.violations.length > 0);
    const violation = result.violations.find(v => v.metric === "avg_words_per_sentence");
    assert.ok(violation);
    assert.strictEqual(violation?.status, "failed");
    assert.strictEqual(violation?.severity, "high");
    assert.ok(violation?.revision_levers.includes("shorten_long_sentences"));
  });

  it("calculates fit score correctly", () => {
    const text = "The cat sat on the mat.";
    const profile = {
      targets: {
        counts: {
          word_count: { value: 6, operator: "at_least" }
        }
      }
    };

    const result = lintText(text, profile);
    assert.strictEqual(result.summary.overall_pass, true);
    assert.strictEqual(result.fit.score, 100);
  });

  it("ranks revision levers by impact", () => {
    const text = "A very long sentence that is also quite repetitive and repetitive and repetitive.";
    const profile = {
      targets: {
        sentence_metrics: {
          avg_words_per_sentence: { value: 5, operator: "at_most" }
        },
        lexical_metrics: {
          lexical_diversity_ttr: { value: 0.9, operator: "at_least" }
        }
      }
    };

    const result = lintText(text, profile);
    assert.ok(result.revision_levers.length >= 2);
    // shorten_long_sentences should be top due to high normalized gap and impact
    assert.strictEqual(result.revision_levers[0].lever, "shorten_long_sentences");
  });

  it("tracks specific words and detects violations with locations", () => {
    const text = "We must leverage our tapestry of skills to delve deeper.";
    const profile = {
      targets: {
        word_tracking_metrics: {
          "leverage": { value: 0, operator: "at_most" }
        }
      },
      track_words: ["leverage"]
    };

    const result = lintText(text, profile);
    assert.strictEqual(result.stats.word_tracking["leverage"], 1);
    assert.ok(result.ai_analysis?.matches.some(m => m.pattern === "leverage" && m.offset === 8));
    assert.strictEqual(result.ai_analysis?.matches[0].line, 1);
    assert.strictEqual(result.ai_analysis?.matches[0].column, 9);
  });

  it("handles unknown/missing metrics by skipping them", () => {
    const text = "Some text.";
    const profile = {
      targets: {
        sentence_metrics: {
          non_existent_metric: { value: 10, operator: "at_most" }
        }
      }
    };

    const result = lintText(text, profile);
    assert.strictEqual(result.summary.overall_pass, false); // overall_pass is false if any are skipped or failed
    assert.strictEqual(result.summary.skipped_checks, 1);
    const skipped = result.skipped_checks.find(v => v.metric === "non_existent_metric");
    assert.strictEqual(skipped?.status, "skipped");
  });

  it("inventoryMarkers provides a detailed report", () => {
    const text = "Let's delve into this tapestry. Certainly! I hope this helps.";
    const analysis = inventoryMarkers(text);
    
    assert.ok(analysis.marker_count >= 4);
    assert.ok(analysis.unique_marker_types >= 4);
    assert.ok(analysis.matches.some(m => m.pattern === "delve"));
    assert.ok(analysis.matches.some(m => m.pattern === "Certainly!"));
    assert.strictEqual(analysis.categories["vocabulary"], 2);
    assert.strictEqual(analysis.categories["assistant_residue"], 2);
  });

  it("supports comprehensive metrics calculation", () => {
      const text = "Sentence one. Sentence two is longer than the first one. Sentence three.";
      const profile = {
          targets: {
              sentence_metrics: {
                  max_words_per_sentence: { value: 5, operator: "at_most" },
                  sentence_length_p90: { value: 10, operator: "at_most" }
              }
          }
      };
      const result = lintText(text, profile);
      assert.ok(result.stats.sentence_metrics.max_words_per_sentence > 0);
      assert.ok(result.stats.sentence_metrics.sentence_length_p90 > 0);
      assert.ok(result.stats.sentence_metrics.sentence_length_stddev > 0);
  });
});
