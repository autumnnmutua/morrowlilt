# MorrowLilt 晨律

一个可自行部署的英语学习网站，包含每日学习包、词汇与短语测评、错题复习、完整词典查询、词形/时态、联想词和每日邮件。

部署者可以在自己的实例中绑定并确认收件邮箱，通过自己的 Resend 账号在每天设定的本地时间接收与网站当天内容一致的英语学习邮件。

## 本地运行

要求 Node.js 22 或更新版本，以及 pnpm。

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

打开终端显示的本地地址。默认配置使用 Wrangler 的本地 D1，不需要 Cloudflare、Resend 或邮箱账号即可浏览页面和运行测试。

完整的本地词库导入、邮件配置、Cloudflare 部署和 Cron 设置见 [SELF_HOSTING.md](SELF_HOSTING.md)。

## 功能边界

- 当前按“一个部署实例对应一个学习者”设计。
- 同一实例中的邮箱更换必须完成确认；新邮箱确认后才会替代旧邮箱接收每日邮件。
- 每日内容按业务日期固化，同一天网页与邮件读取同一份 D1 数据。
- 第三方词典不可用时，可回退到部署者自行导入的 Open English WordNet。
- 完全相同的每日句子、词汇和实用表达会被长期唯一指纹拒绝；近似内容另做近期相似度检查。

## 质量检查

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm audit --audit-level moderate
pnpm license:check
pnpm scan:public
```

## 文档

- [SELF_HOSTING.md](SELF_HOSTING.md)：本地运行、D1、Resend、Cron 和 Cloudflare 部署
- [ARCHITECTURE.md](ARCHITECTURE.md)：系统结构、数据流和单租户边界
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献与提交检查
- [SECURITY.md](SECURITY.md)：漏洞报告与 Secret 处理
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方数据与软件许可

项目源码使用 MIT License。第三方数据、模型、API 和依赖仍适用各自许可与服务条款。
