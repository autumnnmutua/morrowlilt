import type { PersistedDailyContent } from '../repository/daily-content'

export class EmailRenderError extends Error {
  readonly code = 'EMAIL_CONTENT_INCOMPLETE'
  constructor() {
    super('Daily content is incomplete and cannot be rendered as email')
    this.name = 'EmailRenderError'
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return replacements[character]
  })
}

function requireText(value: string | undefined): string {
  const text = value?.trim()
  if (!text) throw new EmailRenderError()
  return text
}

function safeWebsiteUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new EmailRenderError()
    }
    url.username = ''
    url.password = ''
    url.hash = ''
    return url.toString()
  } catch (error) {
    if (error instanceof EmailRenderError) throw error
    throw new EmailRenderError()
  }
}

const row = (value: string) =>
  `<tr><td style="padding-top:4px;padding-right:0;padding-bottom:4px;padding-left:0;font-size:15px;line-height:1.7;color:#304946">• ${escapeHtml(value)}</td></tr>`

export function renderDailyEmail(
  content: PersistedDailyContent,
  websiteUrl = 'https://example.invalid',
): { subject: string; html: string; text: string } {
  const sentence = content.payload.sentence
  const english = requireText(sentence.english)
  const chinese = requireText(sentence.chinese)
  const exercise = requireText(sentence.microExercise)
  const notes = [...sentence.grammarNotes, ...sentence.usageNotes].map(
    requireText,
  )
  if (!notes.length || !sentence.collocations.length)
    throw new EmailRenderError()

  const siteUrl = safeWebsiteUrl(websiteUrl)
  const unsubscribeUrl = new URL(siteUrl)
  unsubscribeUrl.searchParams.set('view', 'settings')
  unsubscribeUrl.searchParams.set('email_action', 'unsubscribe')
  const vocabulary = content.payload.vocabulary.map((item) => ({
    term: item.term,
    partOfSpeech: item.partOfSpeech ?? '词汇',
    chinese: item.definitionZh ?? '结合英文释义与例句理解该词义。',
    english: item.definition,
    example: item.example,
    exampleZh: item.exampleZh,
    usageNote: item.usageNote,
  }))
  const phrases = content.payload.practicalExpressions?.map((item) => ({
    expression: item.expression,
    scenario: item.scenarios
      .map((scenario) => `${scenario.label}：${scenario.description}`)
      .join('；'),
    chinese: item.chineseMeanings.join(' / '),
    warning: item.pitfalls.join('；'),
    example: item.scenarios[0]?.example,
    exampleZh: item.scenarios[0]?.exampleZh,
    coreMeaning: item.coreMeaning,
  })) ?? [
    ...sentence.collocations.map((item) => ({
      expression: item.expression,
      scenario: '用于自然表达具体观点',
      chinese: item.meaning,
      warning: '结合语境使用，避免逐字翻译。',
      example: undefined,
      exampleZh: undefined,
      coreMeaning: item.meaning,
    })),
    ...sentence.alternatives.map((item) => ({
      expression: item.expression,
      scenario: '用于自然替换重复表达',
      chinese: item.note,
      warning: '替换后检查语法结构。',
      example: undefined,
      exampleZh: undefined,
      coreMeaning: item.note,
    })),
  ]

  const vocabularyText = vocabulary
    .map(
      (item) =>
        `- ${item.term}（${item.partOfSpeech}）\n  中文：${item.chinese}\n  英文：${item.english}\n  例句：${item.example}${item.exampleZh ? `\n  例句翻译：${item.exampleZh}` : ''}${item.usageNote ? `\n  用法：${item.usageNote}` : ''}`,
    )
    .join('\n')
  const phraseText = phrases
    .map(
      (item) =>
        `- ${item.expression}\n  释义：${item.chinese}\n  核心：${item.coreMeaning}\n  场景：${item.scenario}${item.example ? `\n  例句：${item.example}` : ''}${item.exampleZh ? `\n  例句翻译：${item.exampleZh}` : ''}\n  注意：${item.warning}`,
    )
    .join('\n')
  const vocabularyHtml = vocabulary
    .map(
      (item) =>
        `<tr><td style="padding-top:12px;padding-right:0;padding-bottom:12px;padding-left:0;border-bottom:1px solid #d8e2dd"><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:17px;line-height:1.5;color:#18322f"><strong>${escapeHtml(item.term)}</strong> <span style="font-size:13px;line-height:1.5;color:#526966">${escapeHtml(item.partOfSpeech)}</span></p><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:15px;line-height:1.7;color:#304946">${escapeHtml(item.chinese)}</p><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:14px;line-height:1.7;color:#526966">${escapeHtml(item.english)}</p><p style="margin-top:0;margin-right:0;margin-bottom:2px;margin-left:0;font-size:14px;line-height:1.7;color:#304946"><em>${escapeHtml(item.example)}</em></p>${item.exampleZh ? `<p style="margin-top:0;margin-right:0;margin-bottom:2px;margin-left:0;font-size:14px;line-height:1.7;color:#304946">${escapeHtml(item.exampleZh)}</p>` : ''}${item.usageNote ? `<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:1.7;color:#526966">用法：${escapeHtml(item.usageNote)}</p>` : ''}</td></tr>`,
    )
    .join('')
  const phraseHtml = phrases
    .map(
      (item) =>
        `<tr><td style="padding-top:12px;padding-right:0;padding-bottom:12px;padding-left:0;border-bottom:1px solid #d8e2dd"><p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:17px;line-height:1.6;color:#18322f"><strong>${escapeHtml(item.expression)}</strong></p><p style="margin-top:0;margin-right:0;margin-bottom:3px;margin-left:0;font-size:14px;line-height:1.7;color:#304946">释义：${escapeHtml(item.chinese)}</p><p style="margin-top:0;margin-right:0;margin-bottom:3px;margin-left:0;font-size:14px;line-height:1.7;color:#304946">核心：${escapeHtml(item.coreMeaning)}</p><p style="margin-top:0;margin-right:0;margin-bottom:3px;margin-left:0;font-size:14px;line-height:1.7;color:#304946">场景：${escapeHtml(item.scenario)}</p>${item.example ? `<p style="margin-top:0;margin-right:0;margin-bottom:2px;margin-left:0;font-size:14px;line-height:1.7;color:#304946"><em>${escapeHtml(item.example)}</em></p>` : ''}${item.exampleZh ? `<p style="margin-top:0;margin-right:0;margin-bottom:2px;margin-left:0;font-size:14px;line-height:1.7;color:#304946">${escapeHtml(item.exampleZh)}</p>` : ''}<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:13px;line-height:1.7;color:#7a5423">注意：${escapeHtml(item.warning)}</p></td></tr>`,
    )
    .join('')

  return {
    subject: `IELTS Daily Learning Package - ${content.contentDate}`,
    text: [
      `IELTS Daily Learning Package - ${content.contentDate}`,
      '',
      '今日学习目标',
      '理解并使用今日高阶词汇与真实场景表达。',
      '',
      '今日句子',
      english,
      '',
      '中文释义',
      chinese,
      '',
      '用法注意',
      notes.map((note) => `- ${note}`).join('\n'),
      '',
      '今日高频词汇',
      vocabularyText,
      '',
      '常用搭配',
      phraseText,
      '',
      '替换表达',
      '以上表达可根据语境替换，使用前检查句法与语气。',
      '',
      '语法与用法',
      notes.map((note) => `- ${note}`).join('\n'),
      '',
      '微练习',
      exercise,
      '',
      `返回网站：${siteUrl}`,
      `取消订阅：${unsubscribeUrl.toString()}`,
    ].join('\n'),
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${escapeHtml(content.contentDate)} 每日学习</title></head><body style="margin:0;background-color:#f7f4ec;font-family:Arial,'Microsoft YaHei',sans-serif;color:#304946"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f7f4ec"><tr><td align="center" style="padding-top:24px;padding-right:12px;padding-bottom:24px;padding-left:12px"><table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf8" style="max-width:600px;background-color:#fffdf8;border:1px solid #d8e2dd"><tr><td bgcolor="#e5f1ec" style="padding-top:24px;padding-right:24px;padding-bottom:24px;padding-left:24px;background-color:#e5f1ec"><p style="margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;font-size:14px;line-height:1.5;color:#235d54">MorrowLilt 晨律 · ${escapeHtml(content.contentDate)}</p><h1 style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-size:25px;line-height:1.4;color:#18322f">今日学习包</h1></td></tr><tr><td style="padding-top:24px;padding-right:24px;padding-bottom:24px;padding-left:24px"><h2 style="font-size:18px;line-height:1.5;color:#18322f">今日学习目标</h2><p style="font-size:15px;line-height:1.7;color:#304946">理解并使用今日高阶词汇与真实场景表达。</p><h2 style="font-size:18px;line-height:1.5;color:#18322f">今日句子</h2><p style="font-size:18px;line-height:1.7;color:#18322f"><strong>${escapeHtml(english)}</strong></p><p style="font-size:15px;line-height:1.7;color:#304946">${escapeHtml(chinese)}</p><h2 style="font-size:18px;line-height:1.5;color:#18322f">今日高频词汇</h2><table width="100%" cellpadding="0" cellspacing="0" border="0">${vocabularyHtml}</table><h2 style="font-size:18px;line-height:1.5;color:#18322f">今日地道表达</h2><table width="100%" cellpadding="0" cellspacing="0" border="0">${phraseHtml}</table><h2 style="font-size:18px;line-height:1.5;color:#18322f">语法与用法</h2><table width="100%" cellpadding="0" cellspacing="0" border="0">${notes.map(row).join('')}</table><h2 style="font-size:18px;line-height:1.5;color:#18322f">微练习</h2><p style="font-size:15px;line-height:1.7;color:#304946">${escapeHtml(exercise)}</p><table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-top:24px"><tr><td bgcolor="#2d7568" style="background-color:#2d7568"><a href="${escapeHtml(siteUrl)}" style="display:inline-block;padding-top:12px;padding-right:22px;padding-bottom:12px;padding-left:22px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1.4">返回网站继续学习</a></td></tr></table><p style="margin-top:24px;margin-right:0;margin-bottom:0;margin-left:0;text-align:center;font-size:12px;line-height:1.6;color:#526966"><a href="${escapeHtml(unsubscribeUrl.toString())}" style="color:#526966">取消订阅</a></p></td></tr></table></td></tr></table></body></html>`,
  }
}
