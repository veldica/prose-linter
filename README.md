# @veldica/prose-linter

A deterministic style-contract library and AI-writing style audit for high-quality prose.

`@veldica/prose-linter` provides the engine for evaluating text against explicit structural targets (sentence length, lexical density, scannability) and identifies common "AI-style" markers. It is designed to be used programmatically in CLIs, editors, and agent feedback loops.

## Features

- **Deterministic Style Contracts**: Define targets for word counts, complexity, and structural variety.
- **AI Marker Inventory**: Detect stock phrases, assistant residue, and repetitive structural patterns common in LLM output.
- **Actionable Revision Levers**: Get prioritized advice on how to fix style violations.
- **Readability Integration**: Built-in support for Gunning-Fog, Flesch-Kincaid, and more.

## Installation

```bash
npm install @veldica/prose-linter
```

## API Usage

### Linting Text

The `lintText` function is the primary entry point for evaluating text against a profile.

```typescript
import { lintText } from '@veldica/prose-linter';

const profile = {
  targets: {
    sentence_metrics: {
      avg_words_per_sentence: { value: 20, operator: 'at_most' },
      sentence_length_stddev: { value: 5, operator: 'at_least' }
    }
  },
  track_ai_patterns: true
};

const result = lintText("Your prose goes here...", profile);

console.log(result.summary.score); // Fit score out of 100
console.log(result.violations);    // Array of failed CheckResults
```

### Inventory AI Markers

Audit a document specifically for "AI-ish" patterns without full structural linting.

```typescript
import { inventoryMarkers } from '@veldica/prose-linter';

const analysis = inventoryMarkers(text, { track_ai_patterns: true });

console.log(analysis.style_band); // "low" | "moderate" | "high" | "very_high"
console.log(analysis.matches);    // Array of matches with line/column locations
```

## Result Structure

The `LintResult` object returned by `lintText` includes:

- `summary`: High-level compliance numbers (score, counts).
- `checks`: All checks performed (passed, failed, and skipped).
- `violations`: Specifically failed checks.
- `skipped_checks`: Checks that couldn't be run due to missing data.
- `ai_analysis`: Detailed report on AI-style markers.
- `revision_levers`: Ranked suggestions for improvement.

## License

MIT
