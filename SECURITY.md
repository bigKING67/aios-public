# Security Policy / 安全政策

## Supported scope / 支持范围

Security reports are accepted for the current public `main` snapshot on a
best-effort basis. The public repository excludes production configuration,
private business data, deployment access, and internal operational evidence.
No response deadline, bug bounty, or reward is promised.

当前公开 `main` 快照接受安全问题报告，并按尽力而为原则处理。公开仓库不包含生产
配置、私有业务数据、部署访问能力和内部运行证据。本项目不承诺响应时限、漏洞赏金
或奖励。

## Report a vulnerability privately / 私密报告漏洞

Use GitHub Private Vulnerability Reporting:

<https://github.com/bigKING67/aios-public/security/advisories/new>

Do not disclose vulnerability details in a public issue, pull request,
discussion, commit, screenshot, or log. Include only the information needed to
reproduce and assess the issue:

- affected public commit and component;
- expected security boundary and observed behavior;
- minimal reproduction steps or proof of concept;
- realistic impact and prerequisites; and
- a suggested remediation, if available.

使用 GitHub 私密漏洞报告：

<https://github.com/bigKING67/aios-public/security/advisories/new>

不要在公开 Issue、Pull Request、Discussion、提交、截图或日志中披露漏洞细节。
报告请仅包含复现和评估问题所需的信息：

- 受影响的公开提交与组件；
- 预期安全边界与实际行为；
- 最小复现步骤或概念验证；
- 真实影响与必要前置条件；
- 如有，可提供修复建议。

Remove all credentials, tokens, cookies, personal information, business data,
private hostnames, and unrelated production evidence. If private reporting is
temporarily unavailable, open a public issue containing no vulnerability
details and ask the repository owner for a private contact channel.

请移除全部凭据、Token、Cookie、个人信息、业务数据、私有主机名和无关生产证据。
若私密报告功能暂时不可用，可创建一个不含任何漏洞细节的公开 Issue，仅请求仓库
所有者提供私密联系方式。

## Testing boundaries / 测试边界

This policy does not grant permission to:

- use AIOS beyond the root [`LICENSE`](LICENSE);
- access or test production systems, accounts, data, networks, or third-party
  services;
- bypass access controls or retain, modify, or disclose data; or
- perform testing on behalf of an organization without prior written
  authorization.

Perform research only in a local environment that you own or are explicitly
authorized to test. Stop immediately if testing reaches data or infrastructure
outside that scope.

本政策不授权任何人：

- 超出根目录 [`LICENSE`](LICENSE) 使用 AIOS；
- 访问或测试生产系统、账户、数据、网络或第三方服务；
- 绕过访问控制，或保留、修改、披露数据；
- 未经事先书面授权代表组织开展测试。

安全研究只能在你拥有或已获得明确测试授权的本地环境中进行；一旦触及范围外的
数据或基础设施，应立即停止。

## Disclosure and response / 披露与响应

The maintainer may request additional evidence, coordinate a remediation, or
close reports that are out of scope or cannot be reproduced. Do not publish a
report or remediation details until the maintainer confirms that coordinated
disclosure is appropriate.

维护者可能要求补充证据、协调修复，或关闭超出范围及无法复现的报告。在维护者确认
适合协调披露之前，请勿公开报告内容或修复细节。
