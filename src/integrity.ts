import type { ContentAnchor, AnchorComparison, ContentIntegrityReport, IntegrityOptions } from "./types.js";

const ANCHOR_PATTERNS = [
  { category: "technical", sub: "url", regex: /https?:\/\/[^\s)]+/gi, weight: 1.0 },
  { category: "technical", sub: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, weight: 1.0 },
  { category: "technical", sub: "version", regex: /v?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?\b/gi, weight: 1.0 },
  { category: "numeric", sub: "percentage", regex: /\d+(?:\.\d+)?%/gi, weight: 1.0 },
  { category: "numeric", sub: "currency", regex: /[\$€£¥]\d+(?:\.\d{2})?/gi, weight: 1.0 },
  { category: "numeric", sub: "measurement", regex: /\b\d+(?:\.\d+)?\s*(?:mb|gb|tb|ms|s|kg|km|m|px|pt|vh|vw|bits?|bytes?)\b/gi, weight: 0.9 },
  { category: "numeric", sub: "number", regex: /\b\d+(?:\.\d+)?\b/g, weight: 0.8 },
  { category: "lexical", sub: "acronym", regex: /\b[A-Z]{2,}\b/g, weight: 0.8 },
  { category: "lexical", sub: "identifier", regex: /\b[A-Z][A-Z0-9_-]+\b/g, weight: 0.8 },
];

const NEGATION_MARKERS = [
  "not", "no", "never", "without", "except", "unless", "cannot", "doesn't", "isn't", "won't", 
  "must not", "prohibited", "neither", "nor"
];

function createAnchor(fullText: string, anchorText: string, offset: number, category: any, sub: string, weight: number): ContentAnchor {
  const start = Math.max(0, offset - 60);
  const end = Math.min(fullText.length, offset + anchorText.length + 60);
  const contextWindow = fullText.slice(start, end).toLowerCase();
  
  let is_negated = false;
  for (const m of NEGATION_MARKERS) {
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(contextWindow)) {
        is_negated = true;
        break;
    }
  }
  
  return {
    text: anchorText,
    category,
    sub_category: sub,
    weight,
    context_before: fullText.slice(start, offset),
    context_after: fullText.slice(offset + anchorText.length, end),
    is_negated,
    offset
  };
}

export function extractAnchors(text: string, options: IntegrityOptions = {}): ContentAnchor[] {
  const anchors: ContentAnchor[] = [];
  
  if (options.aliases) {
    const allPhrases = [...Object.keys(options.aliases), ...Object.values(options.aliases).flat()];
    const multiWordPhrases = allPhrases.filter(p => p.includes(" ")).sort((a, b) => b.length - a.length);
    
    for (const phrase of multiWordPhrases) {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        let match;
        while ((match = regex.exec(text)) !== null) {
            anchors.push(createAnchor(text, match[0], match.index, "lexical", "phrase", 0.9));
        }
    }
  }

  for (const pattern of ANCHOR_PATTERNS) {
    let match: RegExpExecArray | null;
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(text)) !== null) {
      const m = match;
      if (anchors.some(a => a.offset <= m.index && (a.offset + a.text.length) >= (m.index + m[0].length))) continue;
      anchors.push(createAnchor(text, match[0], match.index, pattern.category, pattern.sub, pattern.weight));
    }
  }

  const properNounRegex = /\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z0-9][a-zA-Z0-9]*)*\b/g;
  let match: RegExpExecArray | null;
  properNounRegex.lastIndex = 0;
  while ((match = properNounRegex.exec(text)) !== null) {
    const m = match;
    if (anchors.some(a => a.offset <= m.index && (a.offset + a.text.length) >= (m.index + m[0].length))) continue;
    anchors.push(createAnchor(text, match[0], match.index, options.track_fiction ? "fiction" : "lexical", "proper_noun", 0.8));
  }

  return anchors;
}

export function compareIntegrity(original: string, revised: string, options: IntegrityOptions = {}): ContentIntegrityReport {
  const originalAnchors = extractAnchors(original, options);
  const revisedAnchors = extractAnchors(revised, options);

  const aliasMap = new Map<string, string>();
  if (options.aliases) {
    for (const [canonical, aliases] of Object.entries(options.aliases)) {
      for (const alias of aliases) {
        aliasMap.set(alias.toLowerCase(), canonical.toLowerCase());
      }
      aliasMap.set(canonical.toLowerCase(), canonical.toLowerCase());
    }
  }

  const getCanonical = (text: string) => aliasMap.get(text.toLowerCase()) || text.toLowerCase();

  const originalCounts = new Map<string, { anchors: ContentAnchor[], category: string, weight: number }>();
  for (const a of originalAnchors) {
    const key = getCanonical(a.text);
    const existing = originalCounts.get(key) || { anchors: [], category: a.category, weight: a.weight };
    existing.anchors.push(a);
    originalCounts.set(key, existing);
  }

  const revisedCounts = new Map<string, { anchors: ContentAnchor[], category: string, weight: number }>();
  for (const a of revisedAnchors) {
    const key = getCanonical(a.text);
    const existing = revisedCounts.get(key) || { anchors: [], category: a.category, weight: a.weight };
    existing.anchors.push(a);
    revisedCounts.set(key, existing);
  }

  const allKeys = new Set([...originalCounts.keys(), ...revisedCounts.keys()]);
  const comparisons: AnchorComparison[] = [];
  
  let totalOriginalWeight = 0;
  let matchedWeight = 0;
  let polarityShifts = 0;

  for (const key of allKeys) {
    const orig = originalCounts.get(key);
    const rev = revisedCounts.get(key);
    
    const category = orig?.category || rev?.category || "other";
    const weight = orig?.weight || rev?.weight || 0.5;
    const origCount = orig?.anchors.length || 0;
    const revCount = rev?.anchors.length || 0;
    
    totalOriginalWeight += origCount * weight;

    let status: AnchorComparison["status"] = "preserved";
    if (origCount > 0 && revCount === 0) status = "dropped";
    else if (origCount === 0 && revCount > 0) status = "added";
    else if (origCount !== revCount) status = "changed";

    if (orig && rev) {
        const origNegated = orig.anchors.some(a => a.is_negated);
        const revNegated = rev.anchors.some(a => a.is_negated);
        if (origNegated !== revNegated) {
            status = "polarity_shift";
            polarityShifts++;
        }
    }

    if (status === "preserved" || status === "changed" || status === "polarity_shift") {
        matchedWeight += Math.min(origCount, revCount) * weight;
    }

    comparisons.push({
      text: orig?.anchors[0].text || rev?.anchors[0].text || key,
      category,
      original_count: origCount,
      revised_count: revCount,
      status,
      weight,
      original_contexts: orig?.anchors.map(a => `...${a.context_before.slice(-20)}[${a.text}]${a.context_after.slice(0, 20)}...`) || [],
      revised_contexts: rev?.anchors.map(a => `...${a.context_before.slice(-20)}[${a.text}]${a.context_after.slice(0, 20)}...`) || [],
    });
  }

  const anchorRecall = Array.from(originalCounts.keys()).length > 0 
    ? comparisons.filter(c => c.original_count > 0 && c.revised_count > 0).length / Array.from(originalCounts.keys()).length 
    : 1;
    
  const weightedRecall = totalOriginalWeight > 0 ? matchedWeight / totalOriginalWeight : 1;
  const newAnchorRate = revisedAnchors.length > 0 ? comparisons.filter(c => c.status === "added").length / revisedAnchors.length : 0;

  const baseScore = weightedRecall * 100;
  const polarityPenalty = polarityShifts * 20;
  const hallucinationPenalty = newAnchorRate * 25;
  
  const integrity_score = Math.max(0, Math.min(100, baseScore - polarityPenalty - hallucinationPenalty));

  return {
    integrity_score: Math.round(integrity_score),
    anchor_recall: round(anchorRecall),
    weighted_anchor_recall: round(weightedRecall),
    new_anchor_rate: round(newAnchorRate),
    polarity_shift_count: polarityShifts,
    anchors: comparisons.sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
  };
}

function round(val: number): number {
  return Math.round(val * 1000) / 1000;
}
