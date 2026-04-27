# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-27

### Added
- **Style Templates**: Introduced `CATALOG_TEMPLATES` in `@veldica/prose-linter/catalog` with pre-defined styles:
  - `thriller_fast_paced`
  - `academic_rigorous`
  - `technical_docs`
  - `business_direct`
- **Documentation**: Added comprehensive list of target keys and template usage examples to README.

### Changed
- **API Consistency**: Standardized property naming across result objects.
  - Renamed `lever` to `id` in `RankedLever` objects.
  - Renamed `name` to `label` in `DocumentSignal` objects.
- **Improved AI Auditing**: Updated `inventoryMarkers` to support improved signal labeling and better integration with structural document signals.

## [1.0.0] - 2026-04-20

### Added
- Initial release of `@veldica/prose-linter`.
- Deterministic Style Contracts engine.
- AI Marker Inventory with lexical and structural pattern detection.
- Actionable Revision Levers for prioritized improvement.
