# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-04-27

### Fixed
- **CI/CD**: Reverted repository URL to `git+https` to ensure consistency with GitHub Packages sidebar linking.

## [1.1.1] - 2026-04-27

### Fixed
- **CI/CD**: Fixed repository URL and metadata to ensure correct linking to GitHub Packages.

## [1.1.0] - 2026-04-27

### Added
- **Content Integrity**: Added `compareIntegrity()` for deterministic semantic-anchor preservation tracking.
- **Style Templates**: Introduced `CATALOG_TEMPLATES` with pre-defined styles:
  - `thriller_fast_paced`
  - `academic_rigorous`
  - `technical_docs`
  - `business_direct`
- **Documentation**: Added content integrity documentation and comprehensive target key list to README.
- **Robustness**: Improved handling of `NaN` metric results, added bounds to regex wildcards, and hardened `checkViolations` against malicious payloads.

### Changed
- **API Consistency**: Standardized property naming across result objects.
  - Renamed `id` to `lever` in `RankedLever` objects to align with editorial standards.
  - Renamed `name` to `label` in `DocumentSignal` objects.
- **Improved AI Auditing**: `inventoryMarkers` now returns pre-aggregated `word_tracking_metrics`.
- **Accurate Metrics**: Fixed `avg_characters_per_word` to correctly exclude non-word characters.

## [1.0.0] - 2026-04-20

### Added
- Initial release of `@veldica/prose-linter`.
- Deterministic Style Contracts engine.
- AI Marker Inventory with lexical and structural pattern detection.
- Actionable Revision Levers for prioritized improvement.
