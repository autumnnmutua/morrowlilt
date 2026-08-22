# 自托管指南

## 1. 运行模式

项目支持两种模式：

1. 纯本地开发：React、Worker API 和本地 D1 一起由 Cloudflare Vite 插件启动，不需要登录外部账号。
2. 私人云端实例：部署者创建自己的 Cloudflare Worker、D1、Access 与 Resend 配置。

当前是单租户设计。每个部署实例只有一个 `default` Profile；若多人需要彼此独立的进度、错题和邮箱，应分别部署实例，或先实现经过审计的身份到 Profile 映射。

## 2. 本地启动

安装 Node.js 22 或更新版本和 pnpm，然后执行：

```bash
pnpm install --frozen-lockfile
pnpm db:migrate:local
pnpm dev
```

`wrangler.jsonc` 只包含可公开的本地配置。`.wrangler/` 中的本地数据库状态被 Git 忽略。

常用检查：

```bash
pnpm check
pnpm test:e2e
```

本地邮件功能默认不发送真实邮件。不要把真实密钥写入 `.env.example`、测试或源码。

## 3. 可选的大型本地词库

仓库不复制大规模第三方词典数据。需要完整离线 Provider 回退时：

1. 从 Open English WordNet 官方下载 WNDB 发布包并解压到仓库外或被忽略的 `private/`。
2. 生成分片 SQL：

```bash
node scripts/build-wordnet-sql.mjs <PATH_TO_OEWN_WNDB> private/wordnet-import
```

3. 按文件名顺序，把 `private/wordnet-import/*.sql` 导入本地 D1。

PowerShell 示例：

```powershell
Get-ChildItem private/wordnet-import/*.sql | Sort-Object Name | ForEach-Object {
  pnpm exec wrangler d1 execute morrowlilt-local --local --file $_.FullName
}
```

导入文件、源压缩包和数据库状态均位于被忽略目录，不应提交。

## 4. 创建自己的 Cloudflare 资源

不要修改并提交公共的 `wrangler.jsonc` 来保存生产 ID。复制 `wrangler.example.jsonc` 为被忽略的 `wrangler.production.private.jsonc`，然后在本机替换所有 `<PLACEHOLDER>`。

典型流程：

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create <PLACEHOLDER_DATABASE_NAME>
pnpm exec wrangler d1 migrations apply <PLACEHOLDER_DATABASE_NAME> --remote --config wrangler.production.private.jsonc
pnpm build
pnpm exec wrangler deploy --config wrangler.production.private.jsonc
```

资源名称、数据库 ID、账号 ID、Access audience 和站点 URL 只能进入私有配置或 Cloudflare Secret。

## 5. Worker Secrets

在部署者自己的终端逐项设置，不要把值粘贴到 Issue、日志或提交：

```bash
pnpm exec wrangler secret put RESEND_API_KEY --config wrangler.production.private.jsonc
pnpm exec wrangler secret put MAIL_FROM --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ADMIN_API_KEY --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ACCESS_TEAM_DOMAIN --config wrangler.production.private.jsonc
pnpm exec wrangler secret put ACCESS_AUD --config wrangler.production.private.jsonc
```

`RECIPIENT_EMAIL` 是可选的部署级回退地址。更推荐在网站设置页绑定邮箱并完成确认。已确认的站内邮箱优先于该回退值。

Resend key 应使用仅发信权限。只有拥有并验证发送域时才配置自定义 `MAIL_FROM`；否则遵循 Resend 对测试发送身份和收件人的限制。

## 6. 邮箱更换行为

设置页提交新邮箱后，记录先进入 `pending`，系统发送一次确认邮件。只有打开确认链接后，新邮箱才变为 `verified` 并参与每日发送。

- 只输入新邮箱但未确认：新邮箱不会收到每日邮件。
- 新邮箱确认成功：它替代同一 Profile 下的旧邮箱。
- 当前实例只保留一个 Profile，因此不是多人邮件列表。
- 每日网页和邮件共享同一份 `daily_content`，不会按邮箱分别生成内容。

## 7. Cron 与时区

Cloudflare Cron 使用 UTC。示例 `0 15 * * *` 对应 `Asia/Shanghai` 的 23:00。部署到其他时区时，先确定 `APP_TIME_ZONE` 和目标本地小时，再换算 Cron；不要依赖服务器默认时区。

定时任务会：

1. 计算业务日期；
2. 确保该日 `daily_content` 已落 D1；
3. 读取已确认邮箱或可选回退地址；
4. 使用稳定幂等键发送；
5. 在 `email_deliveries` 保存状态，避免同日重复发送。

## 8. Cloudflare Access

私人部署建议建立 Cloudflare Access 应用，并在 Worker 中配置 issuer/audience 验证。允许身份由部署者自行决定。定时任务不依赖浏览器 Cookie。

## 9. 部署前检查

```bash
pnpm check
pnpm test:e2e
pnpm audit --audit-level moderate
pnpm license:check
pnpm scan:public
```

确认 Git 中不存在 `.env*`（`.env.example` 除外）、`.dev.vars*`、私有 Wrangler 配置、数据库、导出、日志、截图和运行报告。
