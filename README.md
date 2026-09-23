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

## Usage and license status / 使用与授权

This repository is **source-available, not open source**.

Unless a separate written agreement says otherwise, permission is limited to
natural persons acting only on their own behalf to view, clone, and run the
code locally solely for personal, non-commercial learning, research, and
experimentation.

No permission is granted to any company, enterprise, legal entity,
organization, or person acting for or on behalf of one. Without prior written
authorization, the code may not be used for internal business operations,
production deployment, commercial evaluation or proof of concept, products,
SaaS or other services, consulting, training, sale, resale, redistribution, or
commercial derivative works, nor for any direct or indirect commercial
advantage.

Public visibility and GitHub's viewing or forking features do not grant rights
beyond this notice and the GitHub Terms of Service. All rights not expressly
granted are reserved. A root `LICENSE` file with the controlling terms will be
added before this repository is made public.

本仓库为**源码可见（source-available），并非开源软件**。

除非另有书面协议，仅允许以本人名义行事的自然人，为个人、非商业的学习、
研究与实验目的查看、克隆并在本地运行本代码。

本仓库不向任何公司、企业、法人、组织，以及代表前述主体行事的个人授予使用
许可。未经事先书面授权，不得将本代码用于企业内部业务、生产部署、商业评估或
概念验证、产品、SaaS 或其他服务、咨询、培训、销售、转售、再分发、商业性衍生
作品，亦不得用于获取任何直接或间接商业利益。

仓库公开可见以及 GitHub 提供的查看或 Fork 功能，不代表获得本声明及 GitHub
服务条款之外的权利。未明确授予的权利均予保留。本仓库转为公开前，将在根目录
加入具有正式约束力的 `LICENSE` 文件。
