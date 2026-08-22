# MorrowLilt 晨律

可自托管的英语学习与雅思备考辅助工具。它提供每日学习包、实用表达、词汇与短语测评、错题巩固、完整词典查询、词形联想和按用户时区发送的每日邮件。

## 主要能力

- 每个登录账号拥有独立的学习进度、打卡、测试会话、错题、收藏、邮箱和内容历史。
- 同一账号当天内容稳定，两个账号在同一天获得不同的学习包。
- 每日词汇包含词性、中文释义、例句、常用搭配和形态信息。
- 词典服务完整遍历 Provider 返回的 entries、词性和 senses，并支持联想词与可选大型本地词库。
- 用户可在设置页提供自己的 Resend sending-access API Key、已验证发送域、IANA 时区和本地发送小时。
- 用户 API Key 只进入同源 Worker，经 AES-GCM 加密后保存到 D1；前端、API 响应和日志不会回显。
- Cloudflare Cron 每小时唤醒一次，只为达到各自本地发送时间的用户生成并投递邮件；单个用户失败不会阻塞其他用户。
- Workers AI 或可替换 Content Provider 可持续生成新内容；无法生成安全的新内容时明确失败，不静默循环旧内容。

## 本地运行

需要 Node.js 24 和 pnpm 11。

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

打开终端显示的本地地址。默认配置使用本地 D1，浏览页面和运行测试不需要 Cloudflare、Resend 或真实邮箱。

## 完整质量检查

```bash
pnpm check
pnpm test:e2e
pnpm audit --audit-level moderate
```

`pnpm check` 包含格式、Lint、Wrangler 类型、TypeScript、单元/Worker 测试、构建、许可证和公开内容敏感扫描。

## 自行部署

请阅读 [SELF_HOSTING.md](SELF_HOSTING.md)。部署者需要在自己的 Cloudflare 账号中创建 Worker 与 D1，并自行配置 Cloudflare Access。邮件有两种模式：

1. 部署者为一个平台账号设置 Worker Resend Secret；
2. 其他用户在设置页提供自己的 Resend API Key 和已验证发送域。

公共仓库与 CI 不包含真实 Cloudflare ID、Access audience、Resend Key、收件邮箱或生产部署凭证，也不会自动向维护者的生产环境部署。

## 文档

- [SELF_HOSTING.md](SELF_HOSTING.md)：本地运行、D1、Access、Workers AI、Resend 和 Cron
- [ARCHITECTURE.md](ARCHITECTURE.md)：多用户隔离、内容与邮件数据流
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献与提交检查
- [SECURITY.md](SECURITY.md)：漏洞报告与 Secret 处理
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方数据与软件许可

项目源码使用 MIT License；第三方数据、模型、API 和依赖仍适用各自许可与服务条款。
