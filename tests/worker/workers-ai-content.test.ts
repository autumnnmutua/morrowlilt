import { describe, expect, it } from 'vitest'

import { buildCandidateFromCompactOutput } from '../../worker/providers/workers-ai'

const compactOutput = {
  theme: 'technology',
  sentence: {
    english:
      'A thoughtful response can keep an online disagreement constructive without making the conversation feel overly formal.',
    chinese: '体贴的回应能让线上分歧保持建设性，同时不会让对话显得过于正式。',
    grammarNote: '情态动词 can 后接动词原形，用于表达可能产生的效果。',
    usageNote: '适合描述沟通方式如何影响讨论氛围。',
    microExercise:
      'Rewrite the sentence with help instead of keep and preserve its meaning.',
  },
  vocabulary: [
    {
      kind: 'word',
      term: 'constructive',
      partOfSpeech: 'adj.',
      definition: 'intended to help improve a situation or solve a problem',
      definitionZh: '建设性的；有助于改善情况的',
      example: 'She offered constructive feedback after the practice session.',
      exampleZh: '练习结束后，她给出了建设性的反馈。',
    },
    {
      kind: 'word',
      term: 'nuanced',
      partOfSpeech: 'adj.',
      definition: 'showing subtle differences in meaning or opinion',
      definitionZh: '有细微差别的；细致入微的',
      example: 'His nuanced answer acknowledged both sides of the debate.',
      exampleZh: '他细致的回答兼顾了争论双方的观点。',
    },
    {
      kind: 'word',
      term: 'defuse',
      partOfSpeech: 'vt.',
      definition: 'to make a tense or dangerous situation calmer',
      definitionZh: '缓和；平息紧张局面',
      example: 'A light joke helped defuse the tension in the group chat.',
      exampleZh: '一句轻松的玩笑缓和了群聊里的紧张气氛。',
    },
  ],
  practicalExpressions: [
    {
      expression: 'I see where you are coming from',
      expressionType: 'response',
      partOfSpeech: 'response',
      chineseMeanings: ['我理解你的出发点', '我明白你为什么这么想'],
      coreMeaning: 'acknowledge another view without necessarily agreeing',
      context: '朋友提出不同看法、但你想先表示理解时',
      example:
        'I see where you are coming from, but I read the ending differently.',
      exampleZh: '我理解你的出发点，不过我对结局有不同理解。',
      alternative: { expression: 'That makes sense', nuance: '更偏向认可理由' },
    },
    {
      expression: 'Let us call it there',
      expressionType: 'phrase',
      partOfSpeech: 'phrase',
      chineseMeanings: ['今天先到这里', '就此打住'],
      coreMeaning: 'suggest stopping an activity or discussion at this point',
      context: '游戏或讨论已经持续较久，想自然收尾时',
      example:
        'We have made good progress, so let us call it there for tonight.',
      exampleZh: '我们进展不错，今晚就先到这里吧。',
      alternative: {
        expression: 'Let us wrap up',
        nuance: '更常用于任务或会议收尾',
      },
    },
    {
      expression: 'No hard feelings',
      expressionType: 'idiom',
      partOfSpeech: 'idiom',
      chineseMeanings: ['别往心里去', '没有芥蒂'],
      coreMeaning: 'say that you remain friendly after a disagreement',
      context: '比赛或争论结束后，想表明彼此没有芥蒂时',
      example: 'We argued about the strategy, but there are no hard feelings.',
      exampleZh: '我们刚才为策略争论过，不过彼此都别往心里去。',
      alternative: { expression: 'We are good', nuance: '更加口语化、简短' },
    },
  ],
  topic: {
    prompt:
      'How can online communities encourage disagreement without becoming hostile?',
    preparationPoints: ['明确核心观点', '给出具体例子', '说明可能的限制'],
  },
}

describe('Workers AI daily-content adapter', () => {
  it('expands compact structured output into a complete validated package', () => {
    const candidate = buildCandidateFromCompactOutput(
      compactOutput,
      '2026-09-05',
      'cloudflare-workers-ai',
    )

    expect(candidate.payload.vocabulary).toHaveLength(3)
    expect(candidate.payload.practicalExpressions).toHaveLength(3)
    expect(candidate.payload.sentence.collocations).toEqual([
      { expression: 'constructive', meaning: '建设性的；有助于改善情况的' },
      { expression: 'nuanced', meaning: '有细微差别的；细致入微的' },
    ])
    expect(candidate.payload.practicalExpressions?.[0].scenarios).toHaveLength(
      2,
    )
  })
})
