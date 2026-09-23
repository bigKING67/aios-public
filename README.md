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

## Feedback, contributions, and security / 反馈、贡献与安全

Reproducible bug reports and documentation feedback from individual users are
welcome through [GitHub Issues](https://github.com/bigKING67/aios-public/issues).
This repository is a generated, one-way public snapshot, so direct changes and
pull requests are not automatically imported into the private source. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing a change.

Report suspected vulnerabilities privately according to
[`SECURITY.md`](SECURITY.md). Do not place vulnerability details, credentials,
private data, or production evidence in a public issue or pull request.
Participation in Issues or pull requests does not grant any additional right
to use the code beyond the root `LICENSE`.

欢迎个人用户通过 [GitHub Issues](https://github.com/bigKING67/aios-public/issues)
提交可复现的缺陷和文档反馈。本仓库是由私有源仓库单向生成的公开快照，直接修改或
Pull Request 不会自动回流私有源仓库；提出变更前请先阅读
[`CONTRIBUTING.md`](CONTRIBUTING.md)。

疑似安全漏洞请按 [`SECURITY.md`](SECURITY.md) 私密报告。不要在公开 Issue 或
Pull Request 中披露漏洞细节、凭据、私有数据或生产证据。参与 Issue 或 Pull
Request 不会获得根目录 `LICENSE` 以外的任何代码使用权。

## Usage and license status / 使用与授权

This repository is **source-available, not open source**.

Unless a separate written agreement says otherwise, permission is limited to
natural persons acting only on their own behalf to view, clone, run locally,
privately modify, and maintain a GitHub fork of the code solely for personal,
non-commercial learning, research, and experimentation.

No permission is granted to any company, enterprise, legal entity,
organization, or person acting for or on behalf of one. Without prior written
authorization, the code may not be used for internal business operations,
production deployment, commercial evaluation or proof of concept, products,
SaaS or other services, consulting, training, sale, resale, redistribution
outside the limited hosted-fork permission, or commercial derivative works,
nor for any direct or indirect commercial advantage.

The root [`LICENSE`](LICENSE) contains the controlling terms. Public visibility
and GitHub's viewing or forking features do not grant rights beyond that
license and the GitHub Terms of Service. All rights not expressly granted are
reserved.

Third-party and separately licensed material is governed by its own terms, as
listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Those terms may
grant broader rights for the identified component only; they do not grant any
right to use the rest of AIOS for an organizational or commercial purpose.

本仓库为**源码可见（source-available），并非开源软件**。

除非另有书面协议，仅允许以本人名义行事的自然人，为个人、非商业的学习、
研究与实验目的查看、克隆、在本地运行、私下修改本代码，以及维护 GitHub Fork。

本仓库不向任何公司、企业、法人、组织，以及代表前述主体行事的个人授予使用
许可。未经事先书面授权，不得将本代码用于企业内部业务、生产部署、商业评估或
概念验证、产品、SaaS 或其他服务、咨询、培训、销售、转售、超出托管 Fork 许可
范围的再分发、商业性衍生作品，亦不得用于获取任何直接或间接商业利益。

根目录的 [`LICENSE`](LICENSE) 为正式约束条款。仓库公开可见以及 GitHub 提供的
查看或 Fork 功能，不代表获得该许可证及 GitHub 服务条款之外的权利。未明确授予
的权利均予保留。

第三方及单独许可的材料继续适用其各自条款，详见
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。这些条款即使向特定组件授予
更宽泛的权利，也不会把该权利扩展到 AIOS 的其他部分，更不代表企业或组织获准
使用 AIOS 自有代码。
