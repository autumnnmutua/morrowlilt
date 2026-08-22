# 贡献指南

## 开始

1. Fork 或创建本地分支。
2. 运行 `pnpm install --frozen-lockfile`。
3. 运行 `pnpm db:migrate:local` 和 `pnpm dev`。
4. 为行为变更补充测试和文档。

## 代码约定

- API 位于 `/api/*`，前端不直接调用第三方 Provider。
- 不在模块级可变对象保存请求状态。
- 外部请求必须有超时、结构校验和有限重试。
- D1 查询使用参数绑定；数据结构变更必须新增顺序 migration。
- 不截断词典 Provider 返回的词性或义项。
- 邮件与网页必须读取同一用户、同一业务日的不可变学习包。
- 新增用户数据时必须携带 `profile_id` 外键并补充跨账号越权测试。
- Provider API Key 只能加密保存，接口和日志不得返回明文或密文。
- 不提交真实邮箱、账号 ID、资源 ID、Secret、私人域名、数据库或运行报告。

## 提交前

```bash
pnpm check
pnpm test:e2e
pnpm audit --audit-level moderate
pnpm license:check
pnpm scan:public
```

Pull Request 应说明变更目的、风险、测试证据和 migration/回滚影响。不要附带包含私人账号信息的后台截图。
