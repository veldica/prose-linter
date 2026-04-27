import { describe, it } from "node:test";
import assert from "node:assert";
import { compareIntegrity } from "./integrity.js";

describe("Content Integrity Comparison", () => {
  it("detects preserved anchors and dropped anchors", () => {
    const original = "The system supports AES-256 encryption and version 1.2.0. Visit https://example.com for more.";
    const revised = "The system supports encryption and version 1.2.0.";
    
    const report = compareIntegrity(original, revised);
    
    assert.ok(report.integrity_score < 100);
    const aesMatch = report.anchors.find(a => a.text === "AES-256");
    assert.strictEqual(aesMatch?.status, "dropped");
    
    const versionMatch = report.anchors.find(a => a.text === "1.2.0");
    assert.strictEqual(versionMatch?.status, "preserved");
    
    const urlMatch = report.anchors.find(a => a.text === "https://example.com");
    assert.strictEqual(urlMatch?.status, "dropped");
  });

  it("handles aliases correctly", () => {
    const original = "We use JavaScript and the application programming interface.";
    const revised = "We use JS and the API.";
    const options = {
      aliases: {
        "JavaScript": ["JS"],
        "application programming interface": ["API"]
      }
    };
    
    const report = compareIntegrity(original, revised, options);
    assert.strictEqual(report.integrity_score, 100);
    assert.strictEqual(report.anchors.find(a => a.text.toLowerCase() === "javascript")?.status, "preserved");
  });

  it("detects polarity shifts", () => {
    const original = "Encryption is required.";
    const revised = "Encryption is not required.";
    
    const report = compareIntegrity(original, revised);
    const match = report.anchors.find(a => a.text === "Encryption");
    assert.strictEqual(match?.status, "polarity_shift");
    assert.strictEqual(report.polarity_shift_count, 1);
    assert.ok(report.integrity_score < 90);
  });

  it("detects new (hallucinated) anchors", () => {
    const original = "We support version 1.0.";
    const revised = "We support version 1.0 and SOC 2 compliance.";
    
    const report = compareIntegrity(original, revised);
    const soc2Match = report.anchors.find(a => a.text === "SOC 2");
    assert.strictEqual(soc2Match?.status, "added");
    assert.ok(report.new_anchor_rate > 0);
  });
});
