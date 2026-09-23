# AIOS

AIOS is an AI-driven business productivity system with a Vite/React frontend,
a Rust API, and Python/PostgreSQL data workflows.

This repository is a curated public projection of the private development
repository. It intentionally excludes private Git history, production data,
credentials, host identities, deployment access, operational evidence, and
internal task records.

## Public snapshot identity

The exact private source commit and deterministic export manifest are recorded
in [`PUBLIC_SOURCE.json`](PUBLIC_SOURCE.json). Public commits are snapshot
commits and do not preserve private repository ancestry.

## Local development

Requirements:

- Node.js 20 or newer
- npm 9 or newer
- Rust toolchain
- PostgreSQL for backend and data-workflow development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Useful checks:

```bash
npm run lint
npm run type-check
npm run build
```

## Security and production boundaries

Do not place credentials in tracked files. Production deployment, private
business datasets, and environment-specific infrastructure are outside this
public repository.

## License

The licensing posture has not yet been selected. Public visibility alone does
not grant permission to copy, modify, or redistribute this code.
