# 安全策略

## 报告漏洞

在建立公开仓库后，请优先使用代码托管平台的 Private Vulnerability Reporting。不要在公开 Issue 中披露可利用细节、邮箱、访问令牌、账号 ID 或生产网址。

报告应包含受影响版本、复现条件、影响范围和最小化复现。请勿访问不属于自己的数据或执行破坏性测试。

## Secret 处理

- Resend、Cloudflare、Access 和 Provider 凭据只存于部署者自己的 Secret 管理或被忽略的本地文件。
- 用户自带 Resend Key 必须由 Worker 使用 `USER_SECRET_ENCRYPTION_KEY` 加密；不得回显、导出或记录。
- `.env.example` 和 `wrangler.example.jsonc` 只能包含 `<PLACEHOLDER>`。
- 怀疑 Secret 泄漏时，先轮换并验证新凭据，再吊销旧凭据。
- 前端 bundle、source map、错误响应和日志不得包含 Secret 或真实收件地址。
- 每个 API 查询必须从已验证 Access 身份派生 `profile_id` 并校验资源所有权，不能信任客户端传入的用户标识。

## 支持范围

安全修复优先应用于最新版本。第三方 Provider、Cloudflare 和 Resend 的平台问题应同时遵循相应厂商的安全报告流程。
