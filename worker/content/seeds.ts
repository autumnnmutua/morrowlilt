import type {
  ContentTheme,
  DailyContentCandidate,
  DailyContentPayload,
} from '../providers/contracts'
import { practicalExpressionGroup } from './practical-expressions'

type SeedDefinition = {
  theme: ContentTheme
  english: string
  chinese: string
  grammarNotes: string[]
  usageNotes: string[]
  collocations: Array<[string, string]>
  alternatives: Array<[string, string]>
  microExercise: string
  vocabulary: Array<
    [DailyContentPayload['vocabulary'][number]['kind'], string, string, string]
  >
  topicKind: 'speaking' | 'writing'
  topicPrompt: string
  preparationPoints: string[]
}

const seedLibrary: SeedDefinition[] = [
  {
    theme: 'learning',
    english:
      'Although disciplined practice can feel repetitive, it gradually turns fragile knowledge into flexible language that a learner can retrieve under pressure.',
    chinese:
      '尽管自律练习有时显得重复，它会逐步把脆弱的知识转化为能够在压力下灵活提取的语言能力。',
    grammarNotes: ['Although 引导让步状语从句，主句说明与预期相反的长期结果。'],
    usageNotes: [
      'retrieve under pressure 适合描述考试、演讲或工作中的即时调用能力。',
    ],
    collocations: [
      ['disciplined practice', '自律而有规律的练习'],
      ['retrieve knowledge', '提取或调用知识'],
    ],
    alternatives: [
      ['While regular practice may seem monotonous', '更书面的让步开头。'],
      ['turn knowledge into usable language', '更直接地强调知识转化。'],
    ],
    microExercise:
      'Rewrite the sentence with “while” and add one example of language retrieval under pressure.',
    vocabulary: [
      [
        'word',
        'disciplined',
        'showing controlled and consistent effort',
        'Disciplined revision helped her identify recurring weaknesses.',
      ],
      [
        'word',
        'fragile',
        'easily lost, damaged, or disrupted',
        'New vocabulary remains fragile until it is used in several contexts.',
      ],
      [
        'phrase',
        'under pressure',
        'while facing stress or limited time',
        'He can organise complex ideas even under pressure.',
      ],
    ],
    topicKind: 'speaking',
    topicPrompt:
      'Describe a demanding learning habit that became easier over time and explain what made it sustainable.',
    preparationPoints: [
      'the initial difficulty',
      'a concrete adjustment',
      'the long-term outcome',
    ],
  },
  {
    theme: 'campus',
    english:
      'Universities that treat libraries as collaborative civic spaces can support deeper inquiry without diminishing the quiet concentration that scholarship requires.',
    chinese:
      '把图书馆视为协作型公共空间的大学，既能支持更深入的探究，也不必削弱学术研究所需要的安静专注。',
    grammarNotes: [
      'that 引导限制性定语从句；without diminishing 表示“不以削弱……为代价”。',
    ],
    usageNotes: ['civic space 强调空间对更广泛社群的公共价值。'],
    collocations: [
      ['deeper inquiry', '更深入的探究'],
      ['quiet concentration', '安静而持续的专注'],
    ],
    alternatives: [
      ['academic commons', '指共享的校园学习空间。'],
      ['without compromising silent study', '突出不牺牲安静学习。'],
    ],
    microExercise:
      'Write two sentences proposing a library redesign while acknowledging the needs of silent study.',
    vocabulary: [
      [
        'word',
        'inquiry',
        'a systematic effort to discover or understand something',
        'Independent inquiry is central to postgraduate study.',
      ],
      [
        'word',
        'diminish',
        'to make something smaller or less important',
        'Noise can diminish the value of an otherwise excellent study space.',
      ],
      [
        'expression',
        'without compromising',
        'without weakening an important principle or outcome',
        'The campus expanded access without compromising safety.',
      ],
    ],
    topicKind: 'writing',
    topicPrompt:
      'To what extent should universities open their libraries and learning facilities to the wider community?',
    preparationPoints: [
      'public benefit',
      'student access',
      'cost and security',
    ],
  },
  {
    theme: 'technology',
    english:
      'When automated systems shape consequential decisions, transparency is valuable only if ordinary users can interpret the explanation and challenge an error.',
    chinese:
      '当自动化系统影响重要决策时，只有普通用户能够理解解释并质疑错误，透明度才真正有价值。',
    grammarNotes: [
      'only if 引导必要条件；when 从句先限定自动化系统发挥影响的情境。',
    ],
    usageNotes: ['consequential decisions 指对个人生活会产生重大后果的决定。'],
    collocations: [
      ['consequential decision', '影响重大的决定'],
      ['challenge an error', '对错误提出质疑或申诉'],
    ],
    alternatives: [
      ['meaningful transparency', '强调透明必须可理解、可行动。'],
      ['contest an automated outcome', '正式表达对自动结果提出异议。'],
    ],
    microExercise:
      'Give one example of an automated decision and explain what a meaningful appeal process would include.',
    vocabulary: [
      [
        'word',
        'consequential',
        'having important or far-reaching effects',
        'Credit decisions can be highly consequential for young adults.',
      ],
      [
        'word',
        'interpret',
        'to understand and explain the meaning of something',
        'Users must be able to interpret the reasons behind a rejection.',
      ],
      [
        'phrase',
        'appeal process',
        'a formal way to request that a decision be reviewed',
        'A clear appeal process can reduce harm caused by automated errors.',
      ],
    ],
    topicKind: 'speaking',
    topicPrompt:
      'Describe a digital service that makes an important decision and explain how it could become more accountable.',
    preparationPoints: [
      'who is affected',
      'what can go wrong',
      'a practical safeguard',
    ],
  },
  {
    theme: 'environment',
    english:
      'Environmental policies gain durable public support when they distribute short-term costs fairly and make long-term benefits visible in everyday life.',
    chinese:
      '当环境政策公平分担短期成本，并让长期收益在日常生活中清晰可见时，它们更容易获得持久的公众支持。',
    grammarNotes: ['when 引导条件；distribute 与 make 构成并列谓语。'],
    usageNotes: [
      'durable public support 比 popular 更准确地表达长期稳定支持。',
    ],
    collocations: [
      ['distribute costs fairly', '公平分担成本'],
      ['durable public support', '持久的公众支持'],
    ],
    alternatives: [
      ['command lasting support', '较正式地表示赢得长期支持。'],
      ['translate benefits into daily experience', '强调让收益进入日常体验。'],
    ],
    microExercise:
      'Propose one environmental policy and contrast its immediate cost with a visible long-term benefit.',
    vocabulary: [
      [
        'word',
        'durable',
        'able to remain effective or popular for a long time',
        'Durable climate policy requires trust as well as technical evidence.',
      ],
      [
        'word',
        'distribute',
        'to divide and allocate among people or groups',
        'The subsidy distributes transition costs across several industries.',
      ],
      [
        'expression',
        'short-term trade-off',
        'an immediate sacrifice made for a later benefit',
        'Higher initial costs may be a reasonable short-term trade-off.',
      ],
    ],
    topicKind: 'writing',
    topicPrompt:
      'Governments should prioritise environmental policies with visible local benefits rather than distant global gains. Discuss both views.',
    preparationPoints: [
      'public trust',
      'global responsibility',
      'measurable outcomes',
    ],
  },
  {
    theme: 'work',
    english:
      'Flexible work improves autonomy, yet it can quietly extend the working day unless organisations establish credible boundaries around availability.',
    chinese:
      '灵活办公能够提升自主性，但如果组织不为在线可用时间建立可信的边界，它也可能悄然拉长工作日。',
    grammarNotes: ['yet 连接两个形成转折的独立分句；unless 表示“除非”。'],
    usageNotes: [
      'credible boundaries 指能够真正执行、而非停留在口号上的边界。',
    ],
    collocations: [
      ['improve autonomy', '提升自主性'],
      ['set credible boundaries', '建立可信且可执行的边界'],
    ],
    alternatives: [
      ['blur the boundary between work and rest', '强调工作与休息界限模糊。'],
      ['protect employees’ right to disconnect', '强调员工离线权。'],
    ],
    microExercise:
      'Write a balanced recommendation for flexible work using “yet” and “unless” in separate clauses.',
    vocabulary: [
      [
        'word',
        'autonomy',
        'the freedom to make independent decisions',
        'Greater autonomy can improve motivation when expectations remain clear.',
      ],
      [
        'word',
        'credible',
        'convincing because it can be trusted and enforced',
        'A credible policy must apply to managers as well as junior staff.',
      ],
      [
        'phrase',
        'right to disconnect',
        'the ability to ignore work communication outside agreed hours',
        'The right to disconnect can prevent flexible work from becoming endless work.',
      ],
    ],
    topicKind: 'speaking',
    topicPrompt:
      'Describe a workplace rule that could improve both flexibility and employee wellbeing.',
    preparationPoints: [
      'the current problem',
      'how the rule works',
      'a possible disadvantage',
    ],
  },
  {
    theme: 'health',
    english:
      'Public-health messages are more persuasive when they acknowledge practical constraints instead of presenting healthy behaviour as a simple matter of willpower.',
    chinese:
      '公共健康信息如果承认现实限制，而不是把健康行为说成单纯依靠意志力，就会更有说服力。',
    grammarNotes: [
      'instead of 后接动名词 presenting；when 从句说明更有说服力的条件。',
    ],
    usageNotes: [
      'a matter of willpower 用于批评把复杂问题过度归因于个人意志。',
    ],
    collocations: [
      ['practical constraints', '现实中的限制条件'],
      ['a matter of willpower', '单纯依靠意志力的问题'],
    ],
    alternatives: [
      ['recognise structural barriers', '强调承认制度或环境障碍。'],
      ['avoid blaming individuals', '强调避免责备个人。'],
    ],
    microExercise:
      'Revise a simplistic health slogan so that it acknowledges one financial or environmental constraint.',
    vocabulary: [
      [
        'word',
        'persuasive',
        'effective at convincing someone to think or act differently',
        'Specific advice is often more persuasive than a moral warning.',
      ],
      [
        'word',
        'constraint',
        'a limit that restricts possible action',
        'Time and transport are genuine constraints on access to healthcare.',
      ],
      [
        'expression',
        'structural barrier',
        'a system-level obstacle rather than an individual failure',
        'Long waiting lists can become a structural barrier to preventive care.',
      ],
    ],
    topicKind: 'writing',
    topicPrompt:
      'Health campaigns focus too heavily on personal responsibility and not enough on social conditions. To what extent do you agree?',
    preparationPoints: [
      'individual choice',
      'access and inequality',
      'policy design',
    ],
  },
  {
    theme: 'city',
    english:
      'A compact city is not inherently liveable; density becomes an advantage only when residents can reach essential services safely and affordably.',
    chinese:
      '紧凑型城市并非天然宜居；只有居民能够安全且负担得起地获得基本服务，高密度才会成为优势。',
    grammarNotes: [
      '分号连接意义紧密的独立分句；only when 构成强调性的必要条件。',
    ],
    usageNotes: ['inherently 表示某种性质并非事物天生自带。'],
    collocations: [
      ['compact city', '紧凑型城市'],
      ['essential services', '基本公共服务'],
    ],
    alternatives: [
      ['density is not sufficient in itself', '强调密度本身并不充分。'],
      ['within safe and affordable reach', '强调安全且可负担的可达性。'],
    ],
    microExercise:
      'Define a liveable neighbourhood in two sentences and include one condition introduced by “only when”.',
    vocabulary: [
      [
        'word',
        'inherently',
        'as a permanent and inseparable characteristic',
        'Technology is not inherently inclusive without accessible design.',
      ],
      [
        'word',
        'density',
        'the concentration of people or buildings in an area',
        'Moderate density can support frequent public transport.',
      ],
      [
        'phrase',
        'within easy reach',
        'close enough to access without difficulty',
        'Daily services should be within easy reach of older residents.',
      ],
    ],
    topicKind: 'speaking',
    topicPrompt:
      'Describe a neighbourhood that uses space well and explain which residents benefit most from its design.',
    preparationPoints: [
      'layout and transport',
      'access to services',
      'one remaining weakness',
    ],
  },
  {
    theme: 'culture',
    english:
      'Cultural traditions remain meaningful when communities can reinterpret them, rather than preserving every practice as though it were immune to social change.',
    chinese:
      '当社群能够重新诠释文化传统，而不是仿佛其不受社会变化影响般保存每项做法时，传统才会持续具有意义。',
    grammarNotes: [
      'as though 引导与现实保持距离的比较方式从句；rather than 表示取舍。',
    ],
    usageNotes: ['reinterpret traditions 不等于抛弃传统，而是调整其当代表达。'],
    collocations: [
      ['reinterpret a tradition', '重新诠释传统'],
      ['remain meaningful', '持续具有意义'],
    ],
    alternatives: [
      ['adapt cultural practices', '调整文化实践以适应新环境。'],
      ['treat tradition as static', '把传统视为一成不变。'],
    ],
    microExercise:
      'Describe one tradition that has changed over time and evaluate whether the change weakened or renewed it.',
    vocabulary: [
      [
        'word',
        'reinterpret',
        'to understand or present something in a new way',
        'Young artists reinterpret local stories through digital media.',
      ],
      [
        'word',
        'immune',
        'not affected by a particular influence or change',
        'No cultural practice is completely immune to migration and technology.',
      ],
      [
        'expression',
        'living tradition',
        'a tradition that continues by adapting in active communities',
        'A living tradition changes while retaining a recognisable core.',
      ],
    ],
    topicKind: 'writing',
    topicPrompt:
      'Traditions survive because they change, not because they remain fixed. Discuss this view with relevant examples.',
    preparationPoints: [
      'cultural identity',
      'generational change',
      'limits of adaptation',
    ],
  },
]

const chineseDefinitions: Record<string, string> = {
  disciplined: '自律的；有条理并能持续投入的',
  fragile: '脆弱的；容易受损或遗忘的',
  'under pressure': '在压力或时间限制下',
  inquiry: '系统性的探究或调查',
  diminish: '削弱；使重要性或程度降低',
  'without compromising': '在不牺牲重要原则或效果的前提下',
  consequential: '会带来重要后果的',
  interpret: '解释；理解信息或意义',
  'appeal process': '申诉流程',
  durable: '耐久的；能够长期维持的',
  distribute: '分配；分发',
  'short-term trade-off': '短期内为获得某项收益而作出的取舍',
  autonomy: '自主权；独立作出决定的能力',
  credible: '可信的；有说服力的',
  'right to disconnect': '下班后不处理工作通信的权利',
  persuasive: '有说服力的',
  constraint: '限制条件；约束',
  'structural barrier': '由制度或环境造成的结构性障碍',
  inherently: '本质上；内在地',
  density: '密度；集中程度',
  'within easy reach': '容易到达或取得',
  reinterpret: '重新解释或理解',
  immune: '不受影响的；具有免疫力的',
  'living tradition': '在现实社群中持续发展变化的传统',
}

const chineseExamples: Record<string, string> = {
  disciplined: '有计划的复习帮助她发现反复出现的薄弱点。',
  fragile: '新词汇在多个语境中使用之前仍然很容易遗忘。',
  'under pressure': '即使在压力下，他也能组织复杂观点。',
  inquiry: '独立探究是研究生学习的核心。',
  diminish: '噪音会削弱一个原本优秀的学习空间的价值。',
  'without compromising': '校园在不牺牲安全的前提下扩大了开放范围。',
  consequential: '信贷决定可能对年轻人产生深远影响。',
  interpret: '用户必须能够理解申请被拒背后的理由。',
  'appeal process': '清晰的申诉流程能够减少自动化错误造成的伤害。',
  durable: '持久的气候政策既需要技术证据，也需要公众信任。',
  distribute: '这项补贴把转型成本分摊到多个行业。',
  'short-term trade-off': '较高的初始成本可能是合理的短期取舍。',
  autonomy: '当预期清晰时，更大的自主权能够提升动力。',
  credible: '可信的政策必须同样适用于管理者和普通员工。',
  'right to disconnect': '离线权能防止灵活办公演变成无休止的工作。',
  persuasive: '具体建议通常比道德警告更有说服力。',
  constraint: '时间和交通确实会限制人们获得医疗服务。',
  'structural barrier': '漫长的等候名单会成为预防性医疗的结构性障碍。',
  inherently: '如果缺少无障碍设计，技术并非天然具有包容性。',
  density: '适度的人口密度能够支持班次频繁的公共交通。',
  'within easy reach': '日常服务应当让老年居民容易到达。',
  reinterpret: '年轻艺术家通过数字媒体重新诠释本地故事。',
  immune: '任何文化实践都不可能完全不受迁徙与技术影响。',
  'living tradition': '活态传统会在保留可辨识核心的同时不断变化。',
}

const wordPartsOfSpeech: Record<string, string> = {
  disciplined: '形容词 adjective',
  fragile: '形容词 adjective',
  inquiry: '名词 noun',
  diminish: '动词 verb',
  consequential: '形容词 adjective',
  interpret: '动词 verb',
  durable: '形容词 adjective',
  distribute: '动词 verb',
  autonomy: '名词 noun',
  credible: '形容词 adjective',
  persuasive: '形容词 adjective',
  constraint: '名词 noun',
  inherently: '副词 adverb',
  density: '名词 noun',
  reinterpret: '动词 verb',
  immune: '形容词 adjective',
}

function partOfSpeechFor(
  kind: DailyContentPayload['vocabulary'][number]['kind'],
  term: string,
): string {
  if (kind === 'word') return wordPartsOfSpeech[term] ?? '词汇'
  if (kind === 'phrase') return '短语'
  return '固定表达'
}

export const seedThemeCoverage = seedLibrary.map((seed) => seed.theme)

export function createSeedCandidates(
  contentDate: string,
): DailyContentCandidate[] {
  return seedLibrary.map((seed, seedIndex) => ({
    payload: {
      schemaVersion: 2,
      contentDate,
      difficulty: 'C1',
      theme: seed.theme,
      originType: 'original',
      generatorVersion: 'seed-v2',
      sentence: {
        english: seed.english,
        chinese: seed.chinese,
        grammarNotes: seed.grammarNotes,
        usageNotes: seed.usageNotes,
        collocations: seed.collocations.map(([expression, meaning]) => ({
          expression,
          meaning,
        })),
        alternatives: seed.alternatives.map(([expression, note]) => ({
          expression,
          note,
        })),
        microExercise: seed.microExercise,
      },
      vocabulary: seed.vocabulary.map(([kind, term, definition, example]) => ({
        kind,
        term,
        partOfSpeech: partOfSpeechFor(kind, term),
        definition,
        definitionZh: chineseDefinitions[term],
        example,
        exampleZh: chineseExamples[term],
        usageNote:
          kind === 'word'
            ? '结合搭配和例句记忆，不要只背单一中文对译。'
            : '把整个词块作为一个单位记忆，并注意适用语域。',
      })),
      practicalExpressions: practicalExpressionGroup(seedIndex),
      topic: {
        kind: 'writing',
        prompt: seed.topicPrompt,
        preparationPoints: seed.preparationPoints,
      },
    },
    provider: 'morrowlilt-built-in',
    attribution: 'MorrowLilt 高阶学习材料',
  }))
}
