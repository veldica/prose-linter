import { lintText } from "./index.js";
import { StyleProfile } from "./types.js";

const sample = `
In today's digital landscape, it is crucial to delve into the intricate tapestry of modern technology. 
Whether you're a beginner or an expert, this all-in-one solution helps you save time and reduce complexity. 
Certainly! I hope this helps you unlock value and drive growth seamlessly in an increasingly complex world.
`; // ~50 words

const document = sample.repeat(200); // ~10,000 words
const profile: StyleProfile = {
    targets: {
        sentence_metrics: {
            avg_words_per_sentence: { value: 15, operator: "at_most" }
        }
    },
    track_ai_patterns: true
};

console.log("Benchmark: Linting ~10,000 word document...");
const start = performance.now();
const result = lintText(document, profile);
const end = performance.now();

console.log(`Execution time: ${(end - start).toFixed(2)}ms`);
console.log(`Word count: ${result.stats.counts.word_count}`);
console.log(`Violations found: ${result.violations.length}`);
console.log(`AI marker count: ${result.ai_analysis?.marker_count}`);

if (end - start > 1000) {
    console.error("PERFORMANCE FAILURE: Execution took longer than 1000ms");
    process.exit(1);
} else {
    console.log("Performance check passed (< 1000ms)");
}
