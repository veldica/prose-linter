import { describe, it } from "node:test";
import assert from "node:assert";
import { lintText } from "./index.js";
import { AI_PATTERNS } from "./catalog.js";

describe("Word & AI Pattern Tracking - Deep Testing", () => {
  it("handles case-insensitivity correctly", () => {
    const text = "Delve DELVE delve DeLvE";
    const profile = {
      track_words: ["delve"],
      targets: {}
    };
    const result = lintText(text, profile);
    assert.strictEqual(result.stats.word_tracking["delve"], 4);
  });

  it("handles word boundaries correctly (no partial matches)", () => {
    const text = "He is delving into the tapestry. Underscored vs underscore.";
    const profile = {
      track_words: ["delve", "underscore"],
      targets: {}
    };
    const result = lintText(text, profile);
    // 'delving' should not match 'delve' (unless we want stem matching, which we currently don't use \b)
    assert.strictEqual(result.stats.word_tracking["delve"], 0);
    assert.strictEqual(result.stats.word_tracking["underscore"], 1); // 'underscored' should not match 'underscore'
  });

  it("handles overlapping or nested patterns", () => {
    // Current implementation uses separate regexes per pattern, so it should count both
    const text = "not only but also";
    const profile = {
      track_words: ["not only", "not only but also"],
      targets: {}
    };
    const result = lintText(text, profile);
    assert.strictEqual(result.stats.word_tracking["not only"], 1);
    assert.strictEqual(result.stats.word_tracking["not only but also"], 1);
  });

  it("handles special characters in user-provided words", () => {
    const text = "The cost is $100.00 (plus tax).";
    const profile = {
      track_words: ["$100.00", "(plus tax)"],
      targets: {}
    };
    const result = lintText(text, profile);
    assert.strictEqual(result.stats.word_tracking["$100.00"], 1);
    assert.strictEqual(result.stats.word_tracking["(plus tax)"], 1);
  });

  it("detects AI patterns correctly in complex sentences", () => {
    const text = "In today's digital landscape, we must leverage dynamic solutions to delve into intricate problems. Certainly! I hope this helps.";
    const profile = {
      track_ai_patterns: true,
      targets: {}
    };
    const result = lintText(text, profile);
    
    // Check word_tracking stats
    assert.strictEqual(result.stats.word_tracking["In today's digital landscape"], 1);
    assert.strictEqual(result.stats.word_tracking["leverage"], 1);
    assert.strictEqual(result.stats.word_tracking["dynamic"], 1);
    assert.strictEqual(result.stats.word_tracking["delve"], 1);
    assert.strictEqual(result.stats.word_tracking["intricate"], 1);
    assert.strictEqual(result.stats.word_tracking["Certainly!"], 1);
    assert.strictEqual(result.stats.word_tracking["I hope this helps"], 1);

    // Check detailed ai_analysis
    assert.ok(result.ai_analysis);
    assert.strictEqual(result.ai_analysis.marker_count, 7); // Specificity deficit no longer triggers without other signals or if text is literary
    assert.ok(result.ai_analysis.marker_density_per_1000_words > 0);
    assert.strictEqual(result.ai_analysis.categories["stock_phrases"], 1);
    assert.strictEqual(result.ai_analysis.categories["vocabulary"], 4);
    assert.strictEqual(result.ai_analysis.categories["assistant_residue"], 2);
    
    const delveMatch = result.ai_analysis.matches.find(m => m.pattern === "delve");
    assert.ok(delveMatch);
    assert.strictEqual(delveMatch.severity, "high");
  });

  it("handles wildcard patterns correctly", () => {
    const text = "Not only is this fast but also it is very reliable.";
    const profile = {
      track_ai_patterns: true,
      targets: {}
    };
    const result = lintText(text, profile);
    assert.strictEqual(result.stats.word_tracking["not only * but also"], 1);
    
    assert.ok(result.ai_analysis);
    const patternMatch = result.ai_analysis.matches.find(m => m.pattern === "not only * but also");
    assert.ok(patternMatch);
    assert.strictEqual(patternMatch.category, "sentence_patterns");
  });

  it("detects specificity deficit in vague text", () => {
    const text = "This is a very generic text without any numbers or concrete data points. We will delve into broad benefits and holistic approaches to streamline workflows and improve efficiency. Furthermore, we must consider the transformative power of dynamic solutions in the modern era to elevate our collective potential and foster innovation.";
    const profile = {
      track_ai_patterns: true,
      targets: {}
    };
    const result = lintText(text, profile);
    
    assert.ok(result.ai_analysis);
    const deficitMatch = result.ai_analysis.matches.find(m => m.category === "specificity_deficit");
    assert.ok(deficitMatch);
  });

  it("doesn't flag specificity deficit in technical text", () => {
    const text = "The version 2.4.0 of the API handles 5000 requests per second with a latency of 15ms. We deployed it on 2026-04-26.";
    const profile = {
      track_ai_patterns: true,
      targets: {}
    };
    const result = lintText(text, profile);
    
    assert.ok(result.ai_analysis);
    const deficitMatch = result.ai_analysis?.matches.find(m => m.category === "specificity_deficit");
    assert.strictEqual(deficitMatch, undefined);
  });

  it("evaluates 'First Run AI' text with high-density metrics", () => {
    const text = `
    # Introduction
    In today's digital landscape, we must delve into intricate solutions. As technology continues to evolve, it is not just about speed; it is about building trust. 
    
    # Benefits of X
    This allows teams to streamline workflows. This allows users to unlock potential. We provide a robust, seamless, and dynamic experience. 
    
    # Conclusion
    Certainly! I hope this helps. Ultimately, we must foster innovation to stay ahead.
    `;
    const profile = { track_ai_patterns: true, targets: {} };
    const result = lintText(text, profile);
    
    assert.ok(result.ai_analysis);
    // This text is extremely "AI-heavy" relative to its word count (~70 words)
    // Density should be very high (> 50 per 1k words)
    assert.ok(result.ai_analysis.marker_density_per_1000_words > 100); 
    assert.strictEqual(result.ai_analysis.style_band, "very_high");
    assert.ok(result.ai_analysis.score > 50); // Weighted score should be significant
    
    // Should have caught several categories
    assert.ok(result.ai_analysis.categories["stock_phrases"] >= 2);
    assert.ok(result.ai_analysis.categories["assistant_residue"] >= 2);
    assert.ok(result.ai_analysis.categories["vocabulary"] >= 3);
  });

  it("doesn't fail with empty track_words", () => {
    const text = "Normal text.";
    const profile = {
      track_words: [],
      targets: {}
    };
    const result = lintText(text, profile);
    assert.deepStrictEqual(result.stats.word_tracking, {});
  });

  it("handles empty or whitespace-only text", () => {
    const text = "   ";
    const profile = {
      track_ai_patterns: true,
      targets: {}
    };
    const result = lintText(text, profile);
    assert.ok(result.stats.word_tracking);
    Object.values(result.stats.word_tracking).forEach(count => {
        assert.strictEqual(count, 0);
    });
  });
});
