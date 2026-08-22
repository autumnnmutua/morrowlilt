# 词典 Provider、缓存与完整性边界

## 架构

浏览器只请求同源 `GET /api/dictionary?term=...`。Worker 完成输入规范化、Provider 请求、结构校验、HTML 清理、D1 缓存和错误映射；前端不包含第三方 API 地址调用代码。

`DictionaryProvider` 是可替换接口：

- `lookup(term, signal)`：读取并解析在线结果，同时返回原始结构化 payload。
- `parseCachedPayload(payload, requestUrl)`：使用相同规则重新验证并清理 D1 中的原始 payload。
- 默认实现为 `FreeDictionaryProvider`，目前使用 Free Dictionary API v2。

站内还部署 Open English WordNet 2025 D1 词库作为第二数据源。它包含约 12.6 万个规范词条、18.4 万条带词性的义项记录与不规则词形映射：在线 Provider 正常时会与其去重合并，Provider 404、429、超时或 5xx 时则直接回退。WordNet 数据不进入前端 bundle。

输入联想使用同源 `GET /api/dictionary/suggestions?q=...`，优先合并搜索历史和 D1 词库前缀，再由 Worker 请求 Datamuse `/sug` 补充拼写修正、近似词和高频候选。前端不直接请求 Datamuse；结果在 D1 缓存 24 小时，外部服务不可用时仍返回本地候选。

替换 Provider 时必须保留所有 entries、词性、senses、来源和许可字段，不能为了适配 UI 而只取第一项或前三条。

## 查询规范化

服务端执行 NFKC Unicode 规范化、弯引号统一、小写化、首尾/连续空白整理。允许 1–64 个字符、最多 6 个由空格分隔的英语单词，可含词内撇号和连字符。数字、HTML、控制语义、其他脚本或异常长内容会在发起 Provider 请求及写入历史前拒绝。

联想输入使用更严格的 1–32 字符限制；每次输入防抖 220ms，并取消上一请求。候选框采用 ARIA combobox/listbox，可用上下方向键、Enter 和 Escape 操作。

Provider URL 使用 `encodeURIComponent()` 构造。请求限制为 512 KiB，默认超时 4.5 秒；429 和 5xx 最多有限重试一次。结构化日志只记录操作名、错误码、HTTP 状态和尝试次数，不记录词典 payload 或用户原始输入。

## D1 缓存

`dictionary_cache` 以规范化词条为键，保存：

- Provider 名称；
- 原始结构化 `payload_json`；
- Provider 请求 `source_url`；
- Provider 返回的逐项 `license_json`；
- attribution；
- `fetched_at` 与 `expires_at`。

默认有效期为 7 天。有效缓存直接返回 `cacheStatus=fresh`；过期缓存会尝试联网刷新。刷新遇到 429、超时或服务不可用时，旧结果可以 `cacheStatus=stale` 返回，并同时给出 `warningCode`，UI 必须显示“离线缓存”。404 不使用无关旧词条替代，也不编造结果。

`dictionary_translation_cache` 以原英文文本的 SHA-256 为键，保存中文翻译和归属信息。相同义项或例句只翻译一次；页面仍保留英文原文。若 Provider 名称改变，旧原始 payload 不会由不匹配的解析器直接使用。

Open English WordNet 是明确许可的独立词汇资源，不是对 Free Dictionary API 的抓取或镜像。构建脚本从官方年度发布生成分片 SQL，导入文件与源压缩包只存在被忽略的 `private/`；仓库提交 schema、导入器和署名说明，不提交 34MB 生成数据。

## 展示完整性与来源

页面逐层遍历全部：

1. Provider entries；
2. 每个 entry 的 pronunciations、词形、明确标注的动词时态/名词复数、词源和 source URLs；
3. 所有 parts of speech；
4. 每个词性的全部 senses；
5. 每个 sense 的定义、来源例句、同义词和反义词。

“完整”指 Free Dictionary API 与已导入 Open English WordNet 对该词实际提供、且通过安全结构校验的全部字段。系统不设置“三条义项”等展示上限。Provider 未返回发音、例句或来源时，页面明确显示缺失状态；尤其在无例句时显示“暂无来源例句”，不生成内容冒充引用。

规则词形在服务端生成并标注原形、第三人称单数、现在分词/动名词、过去式、过去分词和名词复数；常用不规则动词使用显式表，WordNet exception 文件补充更多不规则词形与反向 lemma 查找。派生词和时态不是“词义”，页面将两者分区，避免把 `resilience` 误标成 `resilient` 的时态。

Free Dictionary API 的数据完整性、准确性、词条覆盖和可用性不由本站保证。其响应可能有多个 entry，且不同 entry 或音频拥有不同许可。页面应优先展示每项响应自带的 `license` 与 `sourceUrls`。统一署名不能覆盖更具体的音频许可。

## 翻译和生成字段

`translatedDefinition` 与 example `translation` 使用独立结构，必须包含：

- `text`；
- Provider 名称；
- attribution；
- `originType`：`translated`、`ai_assisted` 或 `original`。

合并后的所有 entries、词性和 senses 会先完整保留，再由服务端 Workers AI 以受 JSON Schema 约束的批次补充每条中文释义和已有来源例句的中文翻译；批次异常时再使用 `m2m100-1.2b` 做有限逐条回退。每批最多 24 项、最多两个批次并行，避免多义词触发 Worker 子请求上限。结果写入 D1 翻译缓存，相同英文只翻译一次。UI 以“中文补充”单独展示，原英文定义、例句、层级、顺序和来源不被改写；没有例句时仍显示“暂无来源例句”。翻译失败时返回明确 503，不以截断部分义项伪装完整结果。

生产压测使用高频多义词 `run`：合并后返回形容词、名词、动词 3 类词性、120 个义项和 125 条来源例句，全部义项与例句均有中文补充，首次查询约 16 秒，后续命中 D1 缓存。

## 搜索历史、收藏与复习

- `dictionary_search_history` 只保存规范化词条、搜索次数和最近时间；表中不存在原始输入字段。
- `dictionary_favorites` 以 profile + 规范化词条唯一，重复点击幂等。
- `vocabulary_review_queue` 同样唯一；重复加入会把已有项目恢复为 active 并更新时间，不复制词典正文。

这些表只保存词条标识和 Provider 名称，不复制大规模第三方数据。

## 离线边界

- 第三方词典断线：Worker 可完整查询 D1 中的 Open English WordNet，并给出 `DICTIONARY_PROVIDER_FALLBACK`；联想也能用本地大词库。
- 用户设备断网：当前页面与最近已缓存内容可继续阅读，但新词无法请求 Worker；界面不得假装查询成功。
- D1 大词库有名词、动词、形容词、副词、义项、例句、同义词和不规则词形，但不保证每个词都有发音、中文译文、反义词或例句。中文在首次查询时生成并缓存。

## 错误码

| 错误码                               | HTTP | UI 行为                                  |
| ------------------------------------ | ---: | ---------------------------------------- |
| `INVALID_DICTIONARY_TERM`            |  400 | 保留输入并提示使用合理英语词条           |
| `DICTIONARY_NOT_FOUND`               |  404 | 显示明确空结果，不生成替代释义           |
| `DICTIONARY_RATE_LIMITED`            |  503 | 有过期缓存则显示离线缓存，否则允许重试   |
| `DICTIONARY_TIMEOUT`                 |  504 | 有过期缓存则显示离线缓存，否则允许重试   |
| `DICTIONARY_UNAVAILABLE`             |  503 | 有过期缓存则显示离线缓存，否则允许重试   |
| `DICTIONARY_TRANSLATION_UNAVAILABLE` |  503 | 保留输入，提示中文释义暂不可用并允许重试 |

## 发布前许可检查

Free Dictionary API 仓库目前声明 GPL-3.0；API 响应中的词条数据通常带有独立的 Creative Commons 许可和 Wiktionary 来源，音频又可能采用其他 CC 许可。软件许可、词条许可和音频许可不能混为一谈。发布前必须人工复核 Provider 最新条款、每项署名要求、缓存许可和商业使用边界，详见仓库根目录 `THIRD_PARTY_NOTICES.md`。

Open English WordNet 2025 由 Open English WordNet Community 以 CC BY 4.0 发布；Datamuse 用于联想词，公开产品需保留文档署名并在其 2027 年 API key 政策生效前完成密钥迁移或停用外部补充。本地 WordNet 联想不依赖 Datamuse。
