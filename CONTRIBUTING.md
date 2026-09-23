# Contributing to AIOS / AIOS 贡献说明

Thank you for taking the time to provide feedback. AIOS is published as a
curated, one-way snapshot of a private source repository. It is source-available
under the root [`LICENSE`](LICENSE), not an open-source project.

感谢你提供反馈。AIOS 公开仓库是从私有源仓库单向生成的精选快照，依据根目录
[`LICENSE`](LICENSE) 以源码可见方式发布，并非开源项目。

## Bug reports and documentation feedback / 缺陷与文档反馈

Before opening an issue:

1. Search existing issues for the same behavior.
2. Confirm the behavior against the current public `main` branch.
3. Include the public commit and the `sourceCommit` from
   [`PUBLIC_SOURCE.json`](PUBLIC_SOURCE.json).
4. Provide minimal reproduction steps, expected behavior, and actual behavior.
5. Remove credentials, personal information, business data, private URLs, and
   production logs from every attachment and example.

提交 Issue 前：

1. 先搜索是否已有相同问题。
2. 使用公开仓库当前 `main` 分支复现。
3. 提供公开提交以及 [`PUBLIC_SOURCE.json`](PUBLIC_SOURCE.json) 中的
   `sourceCommit`。
4. 提供最小复现步骤、预期行为和实际行为。
5. 从附件和示例中移除凭据、个人信息、业务数据、私有 URL 与生产日志。

Suspected vulnerabilities must follow [`SECURITY.md`](SECURITY.md) and must not
be disclosed in a public issue.

疑似安全漏洞必须按 [`SECURITY.md`](SECURITY.md) 私密报告，不得通过公开 Issue
披露。

## Pull requests and code contributions / Pull Request 与代码贡献

Do not open a code pull request without prior written coordination with the
repository owner. The public repository is overwritten by deterministic sync
from the private source and does not automatically import public commits.

未经仓库所有者事先书面协调，请勿提交代码 Pull Request。公开仓库会由私有源仓库
确定性同步覆盖，不会自动导入公开仓库中的提交。

If a contribution is invited:

- submit only work you have the right to contribute;
- do not submit on behalf of a company, enterprise, legal entity, organization,
  or client without separate written authorization;
- expect the contribution route and applicable contribution terms to be agreed
  in writing before acceptance; and
- understand that acceptance, discussion, or review does not grant any right to
  use AIOS beyond the root `LICENSE`.

如贡献获得邀请：

- 只能提交你有权贡献的内容；
- 未经单独书面授权，不得代表公司、企业、法人、组织或客户提交；
- 在接受贡献前，贡献路径及适用条款需另行书面约定；
- 接受、讨论或评审贡献，都不代表获得根目录 `LICENSE` 之外的 AIOS 使用权。

## Licensing requests / 授权申请

Requests for organizational, commercial, production, consulting, training, or
redistribution rights require a separate written agreement. Use a contact
method published by the repository owner on GitHub and do not put confidential
commercial information in a public issue.

组织、商业、生产、咨询、培训或再分发用途必须另行取得书面授权。请使用仓库所有者
在 GitHub 公开的联系方式，且不要在公开 Issue 中填写商业机密。

## Conduct / 交流规范

Keep reports factual, respectful, and focused on reproducible behavior. Spam,
harassment, credential disclosure, and attempts to use the issue tracker to
circumvent the license boundary may be closed without response.

请保持事实清晰、相互尊重，并聚焦可复现行为。垃圾信息、骚扰、凭据披露，或试图
借助 Issue 绕过许可证边界的内容，可能会被直接关闭。
