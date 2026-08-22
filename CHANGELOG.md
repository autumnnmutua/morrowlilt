# Changelog

本项目遵循 Keep a Changelog 的结构；正式版本发布后采用语义化版本号。

## [Unreleased]

### Added

- React SPA、同源 Worker API、D1 migrations 和 Cron 邮件骨架。
- 每日学习包、打卡、随机测评、结果报告、错题复习和设置页。
- 完整词典 entries/词性/senses、中文补充、词形/时态和联想词。
- Open English WordNet 2025 可选 D1 导入脚本。
- 单租户邮箱绑定、确认、退订、测试发送和幂等每日投递。
- 长期每日内容组件去重与近期相似度检查。
- 本地运行、自托管、安全、贡献和第三方许可文档。

### Changed

- 移除口语练习和写作测评入口及后台生成依赖。
- 多义词中文补充改为受结构约束的批量翻译，降低 Worker 子请求数量。

### Security

- Access JWT 校验、同源写入门禁、请求长度限制、HTML 清理、日志脱敏和 Secret 扫描。
