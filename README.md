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
  track_ai_patterns: true,
  track_words: ["revolutionary", "leverage"] // Track specific words
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

### Content Integrity Comparison

Check if a rewrite preserved critical factual anchors (names, dates, URLs, version numbers) from the original text.

```typescript
import { compareIntegrity } from '@veldica/prose-linter';

const original = "The system supports AES-256 encryption. Visit https://example.com for more.";
const revised = "The system uses encryption. Go to our site.";

const report = compareIntegrity(original, revised, {
  aliases: {
    "AES-256": ["encryption"]
  }
});

console.log(report.integrity_score); // 0-100 score
console.log(report.anchor_recall);    // Ratio of anchors preserved
console.log(report.anchors);          // List of added, dropped, and shifted anchors
console.log(report.polarity_shift_count); // Number of anchors whose negation changed
```

Available options:
- `aliases`: Map of canonical terms to their allowed variations.
- `track_fiction`: Enable fiction mode (treats more words as proper nouns).

### Using Pre-defined Templates

The library includes a collection of high-quality templates for common writing styles.

```typescript
import { lintText, CATALOG_TEMPLATES } from '@veldica/prose-linter';

const result = lintText(text, CATALOG_TEMPLATES.thriller_fast_paced);
```

Available templates:
- `thriller_fast_paced`: Optimized for action with short, punchy sentences.
- `academic_rigorous`: High complexity, formal vocabulary, and rigorous structure.
- `technical_docs`: Clear, instructional, and highly scannable.
- `business_direct`: Professional and concise for quick decision making.

## Style Profile Configuration

A `StyleProfile` allows you to set specific targets across several metric groups:

| Group | Key Metrics |
|-------|-------------|
| `counts` | `word_count`, `sentence_count`, `paragraph_count` |
| `sentence_metrics` | `avg_words_per_sentence`, `sentence_length_stddev`, `max_words_per_sentence`, `sentence_length_p95` |
| `paragraph_metrics` | `avg_words_per_paragraph`, `max_words_per_paragraph`, `percent_paragraphs_over_100_words` |
| `lexical_metrics` | `complex_word_ratio`, `unique_word_count`, `repetition_ratio` |
| `scannability_metrics` | `heading_density`, `list_density`, `paragraph_scannability_score` |
| `fiction_metrics` | `dialogue_ratio`, `scene_density_proxy`, `sensory_term_density` |
| `formulas` | `flesch_kincaid_grade_level`, `gunning_fog`, `consensus_grade` |
| `word_tracking_metrics` | Counts for words defined in `track_words` |

## Result Structure

The `FullLintResult` object returned by `lintText` includes:

- `summary`: High-level compliance numbers (score, counts).
- `checks`: All checks performed (passed, failed, and skipped).
- `violations`: Specifically failed checks.
- `skipped_checks`: Checks that couldn't be run due to missing data.
- `ai_analysis`: Detailed report on AI-style markers.
- `revision_levers`: Ranked suggestions for improvement.
  - `id`: Unique identifier for the lever (e.g., "shorten_long_sentences").
  - `label`: Human-readable name.
  - `score`: Priority score (0-100).
  - `explanation`: Detailed advice.
  - `evidence`: Specific violations triggering this lever.

## License

MIT
