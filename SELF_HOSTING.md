# 自托管指南

## 1. 本地运行

安装 Node.js 24 与 pnpm 11：

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

React、同源 Worker API 与本地 D1 会由 Cloudflare Vite 插件一起启动。本地默认不发送真实邮件，`.wrangler/`、`.env*`、`.dev.vars*`、私有配置和数据库均被 Git 忽略。

## 2. 多用户身份

生产环境使用 Cloudflare Access JWT 的 issuer、audience、subject 与邮箱哈希建立账号映射：

- 每个账号映射到唯一 `profile_id`；
- 打卡、测试、错题、收藏、每日内容与邮件查询都附带该 `profile_id`；
- API 不接受由浏览器自行指定的 profile；
- 猜测其他用户测试会话或资源 ID 仍会返回 403/404；
- 登录邮箱变化不会自动夺取另一个账号，停用与重新授权会保留历史进度。

先在自己的 Cloudflare Zero Trust 中创建 Access 应用和仅允许目标身份的策略，再把 team domain 与 application audience 作为 Worker Secret 配置。Cron 的 `scheduled()` 不依赖浏览器 Cookie。

## 3. 创建 Cloudflare 资源

复制 `wrangler.example.jsonc` 为被忽略的 `wrangler.production.private.jsonc`，替换全部 `<PLACEHOLDER>`。不要修改公共示例来保存真实 ID。

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create <PLACEHOLDER_DATABASE_NAME>
pnpm exec wrangler d1 migrations apply <PLACEHOLDER_DATABASE_NAME> --remote --config wrangler.production.private.jsonc
```

生产构建可通过环境变量选择私有 Wrangler 配置：

```bash
CLOUDFLARE_DEPLOY_CONFIG=wrangler.production.private.jsonc pnpm build
pnpm exec wrangler deploy --config dist/daily_english_study/wrangler.json
```

PowerShell：

```powershell
$env:CLOUDFLARE_DEPLOY_CONFIG = 'wrangler.production.private.jsonc'
pnpm build
Remove-Item Env:CLOUDFLARE_DEPLOY_CONFIG
pnpm exec wrangler deploy --config dist/daily_english_study/wrangler.json
```

远程 D1 必须依次应用 `0001`–`0015`。资源名称、数据库 ID、账号 ID、Access audience 和站点 URL只能进入私有配置或 Cloudflare 控制台。

## 4. 必要 Secret

在自己的终端安全输入：

```bash
pnpm exec wrangler secret put USER_SECRET_ENCRYPTION_KEY --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ADMIN_API_KEY --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ACCESS_AUD --config wrangler.production.private.jsonc
```

`USER_SECRET_ENCRYPTION_KEY` 应使用密码学随机生成的高熵值，至少 32 字符。它用于加密用户自带的 Resend API Key，不能进入前端、日志、Issue、截图或仓库。

可选的平台所有者邮件 Secret：

```bash
pnpm exec wrangler secret put RESEND_API_KEY --config wrangler.production.private.jsonc
pnpm exec wrangler secret put RECIPIENT_EMAIL --config wrangler.production.private.jsonc
pnpm exec wrangler secret put MAIL_FROM --config wrangler.production.private.jsonc
```

当 Access 登录邮箱与 `RECIPIENT_EMAIL` 相同，该账号使用平台邮件服务；其他账号不会共享或读取这把 Key。

## 5. 用户自带 Resend

其他用户在“设置 → 每日邮件”中填写：

1. 自己的 Resend sending-access API Key；
2. 属于该 Resend 账号、且已验证发送域下的发件地址；
3. IANA 时区，例如 `Asia/Shanghai`；
4. 0–23 的本地发送小时；
5. 需要接收邮件的邮箱，并点击确认邮件。

保存前，Worker 会向 Resend 的非真人测试地址做一次带稳定幂等键的发件域探测。错误 Key、未验证域、权限不匹配和默认 `resend.dev` 测试域都会被拒绝。探测通过后 Key 使用 AES-GCM 加密写入 D1，设置 API 只返回 `providerConfigured`，从不返回密文或明文 Key。

同一规范化收件邮箱只能绑定一个账号。更换邮箱不会改变历史进度；新邮箱只有在确认链接完成后才参与定时投递。

## 6. Cron 与时区

Cloudflare Cron 使用 UTC，公共配置使用 `0 * * * *` 每个 UTC 整点唤醒 Worker。每次执行会逐个读取已确认用户的 IANA 时区和本地发送小时，只处理当前到点用户，因此能支持不同时区以及夏令时变化。

每个目标用户依次执行：

1. 计算该用户业务日期与本地小时；
2. 生成或读取该用户当天不可变内容；
3. 从同一 D1 学习包渲染网页和邮件；
4. 使用稳定 Resend `Idempotency-Key` 投递；
5. 更新 `email_deliveries` 状态。

同一用户同一天只发送一次；一个用户失败会记录脱敏错误并继续处理其他用户。

## 7. 长期内容与 Workers AI

生产环境建议设置 `AI_CONTENT_ENABLED=true` 并配置 `AI` binding，或者提供自己的 `CONTENT_PROVIDER_URL`。在线候选仍会经过 schema、长度、语言、HTML 清理、版权边界、近期相似度和长期组件指纹验证。

内置种子只作为故障回退。AI/Provider 不可用且安全种子耗尽时任务明确失败并有限重试，不会为了保持发送而循环旧句子、单词或话题。

## 8. 可选大型本地词库

仓库不复制大型第三方词典数据。需要 Open English WordNet 回退时，在仓库外下载授权数据，然后执行：

```bash
node scripts/build-wordnet-sql.mjs <PATH_TO_OEWN_WNDB> private/wordnet-import
```

按文件名顺序把生成的 SQL 导入自己的 D1。源压缩包、SQL 分片和数据库状态不得提交。

## 9. 发布前检查

```bash
pnpm check
pnpm test:e2e
pnpm audit --audit-level moderate
```

确认 Git 中不存在真实邮箱、API Key、Cloudflare ID、Access 配置、数据库、日志、截图、Word 报告或私人学习数据。公共 CI 不需要任何生产 Secret，也不会发送真实邮件。
