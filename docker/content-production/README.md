# Content production runtime

Standalone non-root runtime for render, shot extraction and semantic workers. The renderer directory contains exactly the Creative Craft source files bound by `etl/groland_postgres/scripts/content_production/creative-craft.lock.json`, plus its MIT license. Upstream: https://github.com/bigKING67/creative-craft ; source module `integrations/local-production`, package 0.1.0 / HyperFrames 0.8.53. The source snapshot is content-pinned because its upstream module is not yet published. No upstream Git history or unrelated WIP is copied.

Build from the repository root with `docker build -f docker/content-production/Dockerfile -t aios-content-production:local .`. All workers default off and need ledger migrations 021–024, dedicated credentials/environment, and an explicitly enabled feature flag. Rendering children receive a scrubbed environment. Use the isolated compose definition only after target-host validation.

Keep all pinned upstream bytes unchanged, including historical product names in CLI help. Project identity replacement must exclude this vendored package; the source-parity regression test enforces the content lock.
