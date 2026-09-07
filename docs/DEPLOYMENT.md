# 部署与每日邮件配置

## 1. 当前状态

仓库已实现并部署 Cloudflare Worker `scheduled()`、D1 邮件投递状态机、网站邮箱绑定/确认/退订、Resend 服务端发送、邮件预览和显式测试发送。私人生产版本使用受 Cloudflare Access 保护的 workers.dev 地址；用户明确不购买自定义域名。

## 2. 时间与 Cron

Cloudflare Cron Trigger 使用 UTC。应用收到 scheduled event 后，以 `controller.scheduledTime` 和 `APP_TIME_ZONE` 计算本地业务日期与本地小时，不依赖服务器默认时区。

Cron 使用 `*/5 * * * *` 每 5 分钟唤醒 Worker。私人所有者仍以 `APP_TIME_ZONE=Asia/Shanghai` 和 `MAIL_SEND_HOUR_LOCAL=23` 发送，即在北京时间 23 点这一小时内首次成功投递；其他账号分别使用设置页保存的 IANA 时区和本地发送小时。这样有夏令时的账号也由 `Intl` 按当天偏移换算，不需要把所有人的时间猜成一个固定 UTC 表达式。

系统会在每个账号的业务日零点以及发送前一小时预生成当天不可变内容。生成失败时，后续 5 分钟触发会使用新的变化种子继续有限尝试，避免永久重放同一个无效候选；一旦成功写入 D1，同一天网页和邮件始终读取同一快照。同小时重复发送由 D1 唯一键与 Resend 幂等键拦截，瞬时失败可在后续触发中重试；若整个发送小时都失败，Worker 会在之后 12 小时内继续补发原业务日内容，且不会改发成新一天或产生重复邮件。个人发件配置在原发送小时之后才完成时，不追溯发送配置生效前的业务日。Cron 配置更新最多可能需要数分钟传播。

## 3. Worker Secret 与私有配置

以下项目只能配置为 Worker Secret 或私有未跟踪配置，不得放入前端、日志、截图或版本控制：

- `ADMIN_API_KEY`
- `RESEND_API_KEY`
- `USER_SECRET_ENCRYPTION_KEY`（至少 32 字符，只用于加密用户自带的 Resend key）
- `MAIL_FROM`
- `ACCESS_TEAM_DOMAIN`
- `ACCESS_AUD`
- `RECIPIENT_EMAIL`（仅兼容旧式固定收件人；使用网站绑定时可不设置）
- 真实 D1 database ID、账号 ID 与最终私人域名

非敏感但属于私人部署的配置包括：

- `PUBLIC_SITE_URL`
- `APP_TIME_ZONE=Asia/Shanghai`
- `MAIL_SEND_HOUR_LOCAL=23`
- `AI_CONTENT_ENABLED=true` 与可选 Workers AI binding

可在 Cloudflare Dashboard 的 Worker **Settings → Variables and Secrets** 中添加 Secret，也可在安全终端中执行 `wrangler secret put <NAME>`。该命令会创建并部署新 Worker 版本，不应在只做本地开发时运行。Cloudflare Access 先在边缘限制为本人身份，Worker 再验证 JWT 的 RS256 签名、issuer、audience 和有效期；缺少配置时生产 API 失败关闭。Cron 直接调用 `scheduled()`，不依赖浏览器 cookie。

单域名站点的 Access 应用使用 `SameSite=Lax`，并关闭多域名场景的 eager redirect；否则移动浏览器可能在验证码登录后因授权 Cookie 未被携带而重复重定向。保留 HttpOnly 与绑定 Cookie。

## 4. Resend 域名验证

私人所有者可继续使用平台配置的 Resend 发送能力；其他账号不会共享这把 API key。其他账号在设置页能看到每日邮件功能，但必须提供自己的 Resend sending-access API key、已验证发件身份、IANA 时区与发送小时，并确认自己的收件邮箱。自带 key 使用 AES-GCM 加密保存且永不回显。Resend 默认测试域通常只允许向账号所有者范围发送；要发给任意收件人，部署者需要完成下面的自定义发送域流程。

1. 使用自己拥有的独立发送子域，隔离网站与现有邮箱服务信誉。
2. 在实际 DNS 托管方添加 Resend 给出的 DKIM、SPF/MX 记录，值逐字一致；按现有邮件策略决定 DMARC。
3. 等 Resend 状态变为 **Verified**，不要把未验证域用于生产发送。
4. 创建仅有 sending access、并限制到该发送域的 API key。Resend token 只显示一次，不得复制到聊天、截图或仓库。
5. 在网站设置页提交 key 与该域下的 `MAIL_FROM`。Worker 会向 Resend 官方不投递给真人的测试地址发出一次幂等探测；只有 Resend 接受这个 key 与发件域组合后才会加密保存。默认 `resend.dev` 测试域不会通过其他账号的配置门槛。

不需要额外创建发件邮箱。测试域只适用于 Resend 规定的测试范围，不能替代正式域名验证。

## 5. 网站邮箱绑定

用户在“设置 → 每日邮件”输入地址后，系统将规范化地址和 SHA-256 哈希写入私人 D1，并发送 30 分钟有效的单次确认链接。一个规范化邮箱只能绑定一个账号；并发绑定由唯一索引决定单一胜者。API 和页面只返回脱敏地址。更换收件邮箱只更新当前 profile 的订阅，不移动或重建学习进度。确认后才能触发真实测试邮件；退订保留审计事件，不删除幂等证据。

## 6. 投递幂等与故障恢复

定时邮件使用 `daily-ielts/<local_date>/<recipient_hash>` 作为 D1 唯一 `delivery_key`，同一值也作为 Resend `Idempotency-Key`。状态为：

```text
pending → sending → sent
                  ↘ failed → sending（仅可重试错误，最多 3 次）
```

`sending` 使用两分钟租约。如果 Provider 已接收邮件但 D1 更新失败，租约到期后仍使用相同幂等键；Resend 在 24 小时窗口内返回相同发送结果，不会重复投递。超过窗口的模糊状态不自动重发，需要人工核对。

## 7. 内容一致性与 30 天避重

Cron 为每个到点账号调用 `ensureProfileDailyContent`，邮件直接从这份不可变快照渲染。该账号网页与邮件读取完全相同的记录；两个账号同一天使用不同变化键与不同完整指纹。语义 `content_hash` 排除日期和生成时间，并检查近期内容与已用组件；在线 Provider 使用紧凑结构化输出，服务端补全展示结构后再通过 schema、长度、语言、版权边界、XSS 和相似度验证。若在线 Provider 与种子均无法提供不重复内容，任务明确失败并有限重试，不静默复用旧内容。

## 8. 预览、测试与上线检查

- `POST /api/admin/email/preview`：只渲染 HTML 和纯文本，不发送。
- `POST /api/admin/email/test-send`：需要 Access、管理员授权和 `Idempotency-Key`。
- 网站设置页测试发送：仅限已确认订阅者主动触发。
- 本地与 CI 拦截外部请求并使用 mock，不能向真实地址发信。

上线顺序：

1. 创建 D1 并依次应用仓库中全部 migration，再按需导入 Open English WordNet 2025 数据分片。
2. 设置私有 D1 binding、Access 与管理员 Secret。
3. 配置 Resend 发送域、`RESEND_API_KEY`、`MAIL_FROM` 和最终 `PUBLIC_SITE_URL`。
4. 确认 Cron 为 `*/5 * * * *`；平台所有者业务时区为 `Asia/Shanghai`、本地发送小时为 `23`。
5. 运行 `pnpm check` 与 `pnpm test:e2e`。
6. 登录后检查 health、首页、打卡/撤销、测试、词典联想与大词库回退、邮箱绑定和邮件预览。
7. 显式发送一封测试邮件；再次触发同日任务，确认 `email_deliveries` 没有第二封。
8. 最后绑定自定义域，检查 DNS、SSL、强制 HTTPS、Access 与 Mixed Content。

## 9. 官方依据

- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Scheduled Handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend Domains](https://resend.com/docs/dashboard/domains/introduction)
