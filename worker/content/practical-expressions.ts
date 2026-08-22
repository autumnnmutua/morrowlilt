import type { DailyContentPayload } from '../providers/contracts'

type PracticalExpression = NonNullable<
  DailyContentPayload['practicalExpressions']
>[number]

type CompactExpression = {
  expression: string
  expressionType: PracticalExpression['expressionType']
  partOfSpeech: string
  chineseMeanings: string[]
  coreMeaning: string
  usageNotes: string[]
  first: [string, string, string, string]
  second: [string, string, string, string]
  pitfalls: string[]
  alternatives: Array<[string, string]>
  ieltsUse: string
}

function conciseExpression(
  expression: string,
  expressionType: CompactExpression['expressionType'],
  partOfSpeech: string,
  chineseMeanings: string[],
  coreMeaning: string,
  first: CompactExpression['first'],
  second: CompactExpression['second'],
  pitfall: string,
  alternative: [string, string],
): CompactExpression {
  return {
    expression,
    expressionType,
    partOfSpeech,
    chineseMeanings,
    coreMeaning,
    usageNotes: ['适合熟人交流与自然对话；正式场合需根据语气换用中性表达。'],
    first,
    second,
    pitfalls: [pitfall],
    alternatives: [alternative],
    ieltsUse: '可提升语用理解和自然回应能力；正式写作中应换用对应的中性表达。',
  }
}

const library: CompactExpression[][] = [
  [
    {
      expression: "Don't leave me hanging.",
      expressionType: 'idiom',
      partOfSpeech: '习语句；非正式请求',
      chineseMeanings: [
        '别把我晾在一边',
        '别说话留一半',
        '别让我举着手没人回应',
      ],
      coreMeaning:
        'hanging 的画面是“悬在半空中、没有着落”，因此既能催对方把话说完，也能化解击掌落空的尴尬。',
      usageNotes: [
        '适合熟人聊天、群聊催更和线下轻松互动。',
        '语气通常是调侃，不是严厉责备。',
      ],
      first: [
        '聊天催更',
        '朋友抛出悬念后突然没下文。',
        "You found out what happened? Don't leave me hanging!",
        '你知道发生什么了？别吊我胃口啊！',
      ],
      second: [
        '击掌落空',
        '伸手击掌却没被看到时，用它自嘲最自然。',
        "High five—come on, don't leave me hanging.",
        '击个掌——来嘛，别让我手一直举着。',
      ],
      pitfalls: [
        "不要生硬直译成 Don't let me wait；那只表示等待，丢掉了“没有回应”的画面感。",
      ],
      alternatives: [
        ['Keep me posted.', '强调后续有消息时告诉我，不带催促击掌的含义。'],
      ],
      ieltsUse:
        '可帮助理解口语化隐喻；在正式写作中改用 leave someone without a response。',
    },
    {
      expression: "That's a hot take.",
      expressionType: 'slang',
      partOfSpeech: '网络表达；评价句',
      chineseMeanings: ['这观点够犀利', '这个看法很大胆', '这意见挺容易引战'],
      coreMeaning:
        'hot take 指迅速、鲜明而偏离主流的观点；重点是“有争议”，不只是“说得好”。',
      usageNotes: [
        '适合游戏版本、影视作品或流行文化的主观看法。',
        '既承认新鲜度，又没有直接说对方错。',
      ],
      first: [
        '游戏讨论',
        '队友认为冷门装备才是版本答案。',
        "The starter pistol is the best weapon? That's a hot take.",
        '初始手枪才是最强武器？你这观点够大胆。',
      ],
      second: [
        '影视闲聊',
        '朋友对公认热门作品给出反主流评价。',
        "You think the sequel was better? That's a hot take.",
        '你觉得续集更好？这看法可够少见的。',
      ],
      pitfalls: [
        '不要把 hot take 当成 compliment；根据语气，它也可能带轻微讽刺。',
      ],
      alternatives: [
        ['That is an unconventional view.', '更正式、更中性，适合讨论或写作。'],
      ],
      ieltsUse:
        '有助于区分非正式评价与正式论证；写作可替换为 a controversial viewpoint。',
    },
    {
      expression: 'Fair enough.',
      expressionType: 'response',
      partOfSpeech: '回应语；话语标记',
      chineseMeanings: ['没毛病', '倒也在理', '行吧，我理解'],
      coreMeaning:
        '这里的 fair 不是“公平”，而是承认对方的理由合理，常带有审视后的理解或妥协。',
      usageNotes: [
        '适合不完全赞同但认可理由的场合。',
        '比 OK 更有态度，比 I agree 保留更多距离。',
      ],
      first: [
        '结束一局',
        '朋友因状态不好不想继续。',
        "I'm too tired for another match. — Fair enough, get some rest.",
        '我太累了，不打下一局了。——行吧，好好休息。',
      ],
      second: [
        '讨论方案',
        '你原本不同意，但对方解释后逻辑成立。',
        "We need a simpler route. — Fair enough. Let's test it.",
        '我们需要更简单的路线。——倒也在理，试试看。',
      ],
      pitfalls: [
        '不要机械翻成“足够公平”；它是完整回应语，含义取决于前文理由。',
      ],
      alternatives: [
        ['I see your point.', '更明确地表示理解对方论点，语气稍正式。'],
      ],
      ieltsUse:
        '可用于理解真实对话中的让步；正式论述可用 admittedly 或 this is a valid point。',
    },
  ],
  [
    {
      expression: 'You nailed it.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；肯定回应',
      chineseMeanings: ['你说到点子上了', '你做得太准了', '你完全拿捏住了'],
      coreMeaning: 'nail 原指钉牢或精准击中，这里强调完成得准确、漂亮。',
      usageNotes: ['可夸答案、模仿、操作或对问题的判断。'],
      first: [
        '复盘判断',
        '朋友准确指出输掉比赛的原因。',
        'We lost because we split up too early. — You nailed it.',
        '我们输是因为太早分开了。——你说到点子上了。',
      ],
      second: [
        '线下夸赞',
        '朋友第一次做某件事却完成得很好。',
        'That impression was perfect—you nailed it.',
        '你模仿得太像了，完全拿捏住了。',
      ],
      pitfalls: ['不要理解成真的使用钉子；宾语可省略，it 指刚才的任务或判断。'],
      alternatives: [['You got it exactly right.', '意思更直白，俚语感更弱。']],
      ieltsUse:
        '帮助积累“精准完成”的自然表达；正式写作可用 identify accurately。',
    },
    {
      expression: 'My bad.',
      expressionType: 'response',
      partOfSpeech: '省略式回应；非正式道歉',
      chineseMeanings: ['我的锅', '怪我', '是我弄错了'],
      coreMeaning: '这是把 my mistake 压缩成极口语的自我认错，适合轻微失误。',
      usageNotes: [
        '适合熟人、队友之间迅速认错。',
        '严重后果或正式场合应完整道歉。',
      ],
      first: [
        '游戏失误',
        '误开技能影响队友时立即承认。',
        'I used the ultimate too early—my bad.',
        '我大招开早了——我的锅。',
      ],
      second: [
        '聊天误读',
        '看漏信息后更正自己。',
        'Oh, I read the date wrong. My bad.',
        '哦，我看错日期了，是我弄错了。',
      ],
      pitfalls: ['不要用于伤害他人、工作重大错误等需要承担责任的情境。'],
      alternatives: [['That was on me.', '同样认错，但更强调责任在自己。']],
      ieltsUse:
        '用于识别省略和语域；正式表达可改为 I take responsibility for the error。',
    },
    {
      expression: 'No hard feelings.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；关系修复表达',
      chineseMeanings: ['别往心里去', '咱们没有芥蒂', '别因为这事伤感情'],
      coreMeaning:
        'hard feelings 指怨气或不快，这句话主动说明冲突不会延续到关系里。',
      usageNotes: ['适合比赛、拒绝或小争执后缓和关系。'],
      first: [
        '友谊赛后',
        '竞争激烈但希望关系照旧。',
        'Good game. No hard feelings about that last round.',
        '打得不错，最后那局别往心里去。',
      ],
      second: [
        '婉拒邀请',
        '对方不能参加时表示理解。',
        "You can't make it? No hard feelings—we'll catch up later.",
        '你来不了？没关系，我们改天再聚。',
      ],
      pitfalls: ['冲突尚未解决时贸然说这句，可能像单方面要求对方别生气。'],
      alternatives: [['We are good.', '更随意，强调关系没有问题。']],
      ieltsUse:
        '帮助理解情绪和关系词汇；正式语境可用 there is no lingering resentment。',
    },
  ],
  [
    {
      expression: 'I am down for that.',
      expressionType: 'slang',
      partOfSpeech: '非正式回应；意愿表达',
      chineseMeanings: ['我可以', '我有兴趣', '算我一个'],
      coreMeaning: 'be down for something 表示愿意参加或尝试，并不是情绪低落。',
      usageNotes: ['常用于答应聚会、开黑或临时计划。'],
      first: [
        '约游戏',
        '朋友提议晚些时候组队。',
        "Co-op at nine? I'm down for that.",
        '九点打合作模式？算我一个。',
      ],
      second: [
        '线下计划',
        '有人提议去新餐厅。',
        "Want to try the new place? — I'm down.",
        '想试试那家新店吗？——我可以。',
      ],
      pitfalls: [
        'be down 单独描述人时也可能表示情绪低落，要靠 for 加活动消除歧义。',
      ],
      alternatives: [['Count me in.', '更明确地表示把我算进参与者。']],
      ieltsUse: '适合识别多义短语；正式表达可用 be willing to participate。',
    },
    {
      expression: 'Give me a heads-up.',
      expressionType: 'idiom',
      partOfSpeech: '习语；请求句',
      chineseMeanings: ['提前告诉我一声', '给我提个醒', '事先通知我'],
      coreMeaning: 'heads-up 原指抬头警觉，后来表示提前发出的简短提醒。',
      usageNotes: ['适合日程变化、危险、队友行动前的提醒。'],
      first: [
        '队友配合',
        '希望对方行动前报点。',
        'Give me a heads-up before you push the objective.',
        '你推进目标前先提醒我一声。',
      ],
      second: [
        '行程变化',
        '希望朋友迟到时提前通知。',
        "If you're running late, just give me a heads-up.",
        '如果你要迟到，提前跟我说一声就好。',
      ],
      pitfalls: [
        '不要写成 give me a head up；固定名词是 heads-up，常带连字符。',
      ],
      alternatives: [
        ['Let me know in advance.', '更中性、适合工作与正式安排。'],
      ],
      ieltsUse: '可迁移到通知类语境；正式写作可用 provide advance notice。',
    },
    {
      expression: 'That checks out.',
      expressionType: 'phrasal_verb',
      partOfSpeech: '短语动词句；核实回应',
      chineseMeanings: ['这说得通', '核对得上', '这情况合理'],
      coreMeaning: 'check out 在这里表示经核对后成立，不是“退房”或“看看”。',
      usageNotes: ['适合确认解释、数据或事件顺序合理。'],
      first: [
        '复盘信息',
        '队友的时间线与录像吻合。',
        'The cooldown ended at twelve seconds. — That checks out.',
        '冷却在十二秒结束。——这和记录对得上。',
      ],
      second: [
        '朋友解释',
        '迟到原因与交通情况一致。',
        'The trains were delayed? That checks out.',
        '火车晚点了？那就说得通了。',
      ],
      pitfalls: [
        'check out 有多个义项，主语是信息或解释时才常表示“核实成立”。',
      ],
      alternatives: [
        ['That makes sense.', '更强调逻辑可理解，不一定经过核对。'],
      ],
      ieltsUse:
        '训练短语动词的语境辨义；学术语境可用 the evidence is consistent with the claim。',
    },
  ],
  [
    {
      expression: 'Read the room.',
      expressionType: 'idiom',
      partOfSpeech: '祈使习语；社交判断',
      chineseMeanings: ['看看气氛', '懂点眼色', '判断一下在场人的反应'],
      coreMeaning:
        '不是读房间里的文字，而是观察群体情绪与暗示，再决定怎么说或做。',
      usageNotes: ['常用来提醒某人的玩笑或话题不合时宜。'],
      first: [
        '群聊提醒',
        '有人在大家严肃讨论时继续玩梗。',
        'Maybe stop joking for a second—read the room.',
        '先别开玩笑了，看看现在什么气氛。',
      ],
      second: [
        '线下聚会',
        '朋友没有察觉大家已经疲惫。',
        'Everyone is ready to leave. Read the room.',
        '大家都准备走了，你看看气氛。',
      ],
      pitfalls: ['直接对陌生人说可能显得尖锐，可加 maybe 或 I think 缓和。'],
      alternatives: [
        ['Take the hint.', '强调听懂某个暗示，不一定是整个群体气氛。'],
      ],
      ieltsUse: '补充非语言沟通词汇；正式讨论可用 interpret social cues。',
    },
    {
      expression: 'I will take your word for it.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；保留式信任',
      chineseMeanings: [
        '那我就信你',
        '我姑且相信你的说法',
        '不用证明了，我按你说的算',
      ],
      coreMeaning:
        'take someone’s word 表示依据对方的话接受事实，可能真诚信任，也可能略带保留。',
      usageNotes: ['语气决定是友好信任还是“我不亲自验证了”。'],
      first: [
        '游戏建议',
        '朋友坚持某个装备经过测试更强。',
        "You tested the build? I'll take your word for it.",
        '你测过这套配置了？那我信你。',
      ],
      second: [
        '陌生体验',
        '对方描述你没尝过的食物。',
        "It tastes better than it looks? I'll take your word for it.",
        '它比看起来好吃？那我姑且信你。',
      ],
      pitfalls: [
        '若语调冷淡，可能听起来像不相信；必要时补充 thanks 或 sounds good。',
      ],
      alternatives: [
        ['I trust your judgement.', '更明确、积极地信任对方判断。'],
      ],
      ieltsUse:
        '可用于讨论证据与信任；正式写作应说明 evidence，而不是依赖个人说法。',
    },
    {
      expression: 'We are on the same page.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；共识确认',
      chineseMeanings: ['我们想法一致', '我们理解一致', '我们达成共识了'],
      coreMeaning: '像两个人读到同一页，表示对目标、信息或下一步有相同理解。',
      usageNotes: ['适合讨论策略、计划和边界后确认共识。'],
      first: [
        '战术确认',
        '开始前确认队友都理解计划。',
        'We defend first and rotate late—are we on the same page?',
        '我们先防守、晚点转点——大家理解一致吗？',
      ],
      second: [
        '朋友安排',
        '确认见面地点和时间。',
        "Seven at the north entrance. Great, we're on the same page.",
        '七点北门见。好，我们说定了。',
      ],
      pitfalls: ['它表示理解一致，不等于所有价值观或观点完全相同。'],
      alternatives: [
        ['We have reached a shared understanding.', '更正式，适合会议或论述。'],
      ],
      ieltsUse: '可迁移到协作主题；正式写作可用 reach a consensus。',
    },
  ],
  [
    {
      expression: 'That came out wrong.',
      expressionType: 'phrasal_verb',
      partOfSpeech: '短语动词句；自我修正',
      chineseMeanings: ['我刚才表达错了', '那话说出来变味了', '我不是那个意思'],
      coreMeaning:
        'come out 指话语最终呈现出来的效果；wrong 强调表达结果偏离本意。',
      usageNotes: ['适合马上修补可能冒犯或造成误会的话。'],
      first: [
        '聊天修正',
        '一句玩笑听起来比预想更刻薄。',
        'Sorry, that came out wrong. I meant the timing was unlucky.',
        '抱歉，我刚才说得不对。我是说时机不巧。',
      ],
      second: [
        '语音沟通',
        '措辞让建议听起来像命令。',
        "That came out wrong—I'm suggesting, not ordering.",
        '我刚才表达得不好，我是在建议，不是在命令。',
      ],
      pitfalls: ['只说这句而不澄清本意可能不够，应紧接真正想表达的内容。'],
      alternatives: [
        ['Let me rephrase that.', '更中性，直接表示重新组织语言。'],
      ],
      ieltsUse: '有助于自我修正表达；正式场合可用 clarify or rephrase。',
    },
    {
      expression: 'I get where you are coming from.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；共情回应',
      chineseMeanings: [
        '我理解你的出发点',
        '我明白你为什么这么想',
        '我能理解你的立场',
      ],
      coreMeaning:
        'where you are coming from 指观点背后的经历、动机或逻辑，不是地理来源。',
      usageNotes: ['可以在不同意结论时先承认对方视角。'],
      first: [
        '意见不同',
        '朋友解释为什么不喜欢某种玩法。',
        "I get where you're coming from, but I enjoy the slower pace.",
        '我理解你为什么这么想，不过我喜欢慢一点的节奏。',
      ],
      second: [
        '安慰朋友',
        '对方因过去经历而保持谨慎。',
        "I get where you're coming from. Taking it slowly makes sense.",
        '我理解你的顾虑，慢慢来是合理的。',
      ],
      pitfalls: ['这句表示理解，不自动表示赞同；后半句可清楚说明自己的立场。'],
      alternatives: [
        ['I understand your perspective.', '更正式、适合讨论复杂立场。'],
      ],
      ieltsUse: '适合训练让步论证；写作中可用 this concern is understandable。',
    },
    {
      expression: 'Let us call it a day.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；结束提议',
      chineseMeanings: ['今天就到这吧', '先收工吧', '这局之后结束吧'],
      coreMeaning:
        'call it a day 表示认为当天工作量已经足够，决定停止，不是“给它取名为一天”。',
      usageNotes: ['适合学习、工作或连续游戏后自然收尾。'],
      first: [
        '连麦收尾',
        '大家已经疲惫，提议结束。',
        "We've been playing for three hours. Let's call it a day.",
        '我们玩三小时了，今天就到这吧。',
      ],
      second: [
        '学习结束',
        '完成既定目标后停止。',
        "We finished the review list, so let's call it a day.",
        '复习清单完成了，今天先到这。',
      ],
      pitfalls: ['它通常指结束当天活动，不表示永久放弃项目。'],
      alternatives: [['Let us wrap up.', '更强调把剩余事项收尾后结束。']],
      ieltsUse: '可积累工作与时间管理表达；正式语境可用 conclude the session。',
    },
  ],
  [
    {
      expression: 'It is not that deep.',
      expressionType: 'slang',
      partOfSpeech: '网络回应；降温表达',
      chineseMeanings: ['没那么严重', '别想太复杂', '这事不用过度解读'],
      coreMeaning: 'deep 在这里指意义深重或后果严重；整句用于让讨论降温。',
      usageNotes: ['适合轻松争论，但对方真的受伤时会显得敷衍。'],
      first: [
        '游戏争论',
        '队友把一次普通失误上升到态度问题。',
        "It was one missed shot. It's not that deep.",
        '就是一枪没打中，没那么严重。',
      ],
      second: [
        '网络解读',
        '朋友过度分析一句随口评论。',
        "It was just a joke—it's not that deep.",
        '就是个玩笑，别过度解读。',
      ],
      pitfalls: ['不要用来否定真实情绪或严肃问题，否则会像是在轻视对方。'],
      alternatives: [
        ['We may be overthinking it.', '把“过度思考”包含自己，语气更柔和。'],
      ],
      ieltsUse:
        '帮助识别网络语域；正式表达可用 the issue should not be overstated。',
    },
    {
      expression: 'You have got a point.',
      expressionType: 'idiom',
      partOfSpeech: '回应句；部分认可',
      chineseMeanings: ['你说得有道理', '你这个点成立', '这方面你说得对'],
      coreMeaning:
        'have a point 表示对方至少提出了一个值得考虑的有效理由，并非全盘同意。',
      usageNotes: ['适合争论中承认某一部分，再继续补充。'],
      first: [
        '策略讨论',
        '对方指出计划中的实际风险。',
        "The route is faster but too exposed. — You've got a point.",
        '这条路更快但太暴露。——你说得有道理。',
      ],
      second: [
        '日常选择',
        '朋友提醒价格之外还要考虑时间。',
        "The cheaper option takes twice as long. — You've got a point.",
        '便宜的方案要多花一倍时间。——这点你说得对。',
      ],
      pitfalls: ['不要误写成 your point；口语里的 have got 等于 have。'],
      alternatives: [
        ['That is a valid consideration.', '更正式，强调该因素值得纳入判断。'],
      ],
      ieltsUse:
        '非常适合训练让步与平衡论证；写作可用 it is valid to argue that。',
    },
    {
      expression: 'I am just messing with you.',
      expressionType: 'phrasal_verb',
      partOfSpeech: '短语动词句；玩笑澄清',
      chineseMeanings: ['我逗你呢', '我在跟你开玩笑', '别当真'],
      coreMeaning: 'mess with someone 此处指故意逗弄或开玩笑，不是制造混乱。',
      usageNotes: ['适合熟人之间在对方误信玩笑时立刻澄清。'],
      first: [
        '语音玩笑',
        '假装不知道明显答案后揭晓。',
        "Of course I remember your name—I'm just messing with you.",
        '我当然记得你的名字，我逗你呢。',
      ],
      second: [
        '游戏调侃',
        '故意说要丢下队友。',
        "I'm not leaving the team. I'm just messing with you.",
        '我不会退队的，就是逗你一下。',
      ],
      pitfalls: ['玩笑若触碰边界，这句不能代替道歉；应承认影响并停止。'],
      alternatives: [['I was only teasing.', '更温和，也较少带网络口吻。']],
      ieltsUse: '补充人际互动动词；正式描述可用 make a playful remark。',
    },
  ],
  [
    {
      expression: 'We will play it by ear.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；临机决定',
      chineseMeanings: ['到时候看情况', '随机应变', '先不把计划定死'],
      coreMeaning: '原指不看乐谱凭听觉演奏，后来表示根据当时情况决定。',
      usageNotes: ['适合天气、人数或状态不确定的计划。'],
      first: [
        '周末安排',
        '天气可能影响活动。',
        "If it rains, we'll play it by ear.",
        '如果下雨，我们到时候看情况。',
      ],
      second: [
        '组队计划',
        '不知道朋友几点上线。',
        "We may start at nine, but we'll play it by ear.",
        '我们可能九点开始，不过看情况再定。',
      ],
      pitfalls: ['不要写 play it by year；ear 来自“凭耳朵演奏”的比喻。'],
      alternatives: [
        ['We will decide closer to the time.', '更直白地表示临近时再决定。'],
      ],
      ieltsUse:
        '适合理解音乐隐喻；正式语境可用 adapt the plan as circumstances develop。',
    },
    {
      expression: 'That is on me.',
      expressionType: 'idiom',
      partOfSpeech: '回应句；责任表达',
      chineseMeanings: ['这事责任在我', '这次算我的', '这个我来承担'],
      coreMeaning: 'on me 可表示责任落在自己身上，也可在付款语境表示自己请客。',
      usageNotes: ['承认失误时比 my bad 更认真，但仍然自然简洁。'],
      first: [
        '团队复盘',
        '自己的判断导致计划失败。',
        "I made the wrong call there. That's on me.",
        '刚才是我判断错了，责任在我。',
      ],
      second: [
        '朋友聚餐',
        '主动表示自己付款。',
        'You paid last time, so dinner is on me.',
        '上次你付的，这次晚饭我请。',
      ],
      pitfalls: ['注意责任义与请客义由上下文决定；严重错误还要说明补救措施。'],
      alternatives: [
        ['I take responsibility for that.', '更正式、明确，适合工作场合。'],
      ],
      ieltsUse: '训练介词短语多义；正式论述可用 assume responsibility。',
    },
    {
      expression: 'Let me sleep on it.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；延迟决定',
      chineseMeanings: ['让我考虑一晚', '我想清楚再答复', '先别急着定'],
      coreMeaning: '不是躺在某物上睡觉，而是把决定留到睡一觉后再做。',
      usageNotes: ['适合不想仓促答应或拒绝的重要选择。'],
      first: [
        '购买决定',
        '朋友推荐价格较高的设备。',
        'It looks great, but let me sleep on it.',
        '看起来很不错，不过让我考虑一晚。',
      ],
      second: [
        '组队邀请',
        '需要先确认自己的时间。',
        'Joining the tournament is tempting. Let me sleep on it.',
        '参加比赛挺心动的，让我想一晚再答复。',
      ],
      pitfalls: ['通常暗示隔天答复；若需要更久，应明确给出回复时间。'],
      alternatives: [['Let me think it over.', '不限定一晚，只表示认真考虑。']],
      ieltsUse:
        '可用于决策主题；正式表达可用 take time to consider the proposal。',
    },
  ],
  [
    {
      expression: 'You do you.',
      expressionType: 'slang',
      partOfSpeech: '网络回应；个人选择表达',
      chineseMeanings: ['你按自己的方式来', '你开心就好', '做你自己'],
      coreMeaning:
        '重复的 you 强调个人自主；可以是真诚支持，也可能带“我不评价”的疏离。',
      usageNotes: ['语气友好时表示尊重选择，冷淡时可能略带敷衍。'],
      first: [
        '玩法选择',
        '朋友喜欢非主流配置。',
        'If that build is fun for you, you do you.',
        '如果那套配置让你玩得开心，就按自己的方式来。',
      ],
      second: [
        '生活习惯',
        '对方选择与众不同但无害。',
        'You prefer studying at midnight? You do you.',
        '你喜欢半夜学习？按你舒服的方式来。',
      ],
      pitfalls: ['在敏感决定上可能显得不关心；可加 if it works for you 缓和。'],
      alternatives: [
        ['Do what works best for you.', '支持意味更明确，歧义更少。'],
      ],
      ieltsUse:
        '有助于识别态度和语调；正式讨论可用 respect individual preference。',
    },
    {
      expression: 'That rings a bell.',
      expressionType: 'idiom',
      partOfSpeech: '习语句；模糊记忆回应',
      chineseMeanings: ['听着耳熟', '好像有印象', '这让我想起点什么'],
      coreMeaning: '像铃声触发注意一样，某个名字或信息唤起了不完整的记忆。',
      usageNotes: ['适合记得一点但无法完全确认的情况。'],
      first: [
        '聊游戏角色',
        '听到名字但记不清细节。',
        'Mira from the old expansion? That rings a bell.',
        '旧资料片里的米拉？听着有点耳熟。',
      ],
      second: [
        '线下认人',
        '朋友提到曾见过的人。',
        'The designer we met in Osaka? That rings a bell.',
        '我们在大阪见过的设计师？我好像有印象。',
      ],
      pitfalls: ['它不表示已经完全记起；若确定记得，应说 I remember that。'],
      alternatives: [['That sounds familiar.', '含义直接，几乎没有比喻色彩。']],
      ieltsUse:
        '适合听力中的不确定记忆；正式表达可用 the name is vaguely familiar。',
    },
    {
      expression: 'I would not count on it.',
      expressionType: 'phrasal_verb',
      partOfSpeech: '短语动词句；谨慎否定',
      chineseMeanings: ['别太指望', '这事不太靠谱', '我看未必'],
      coreMeaning: 'count on 表示依赖或确信；否定形式委婉地降低预期。',
      usageNotes: ['比直接说 no 更留余地，适合不确定但概率偏低。'],
      first: [
        '更新预测',
        '朋友问游戏补丁是否会准时上线。',
        "Will the patch arrive tonight? I wouldn't count on it.",
        '补丁今晚会上吗？我看别太指望。',
      ],
      second: [
        '出行计划',
        '天气预报不稳定。',
        "Can we rely on sunshine all day? I wouldn't count on it.",
        '能指望一整天晴天吗？我看未必。',
      ],
      pitfalls: ['这是谨慎判断，不是绝对不可能；不要误解为数学上的“数数”。'],
      alternatives: [['That seems unlikely.', '更中性、适合正式预测。']],
      ieltsUse: '可用于概率与风险表达；写作可用 it is unlikely that。',
    },
  ],
  [
    conciseExpression(
      "I'm down for that.",
      'slang',
      '非正式回应语',
      ['我可以', '我愿意参加', '这个主意我赞成'],
      'down 在此不是“向下”，而是表示愿意参与某个计划或接受某个提议。',
      [
        '朋友邀约',
        '朋友提议周末联机。',
        "A co-op game tonight? I'm down for that.",
        '今晚玩合作游戏？我可以。',
      ],
      [
        '临时计划',
        '同事提议换一家店吃饭。',
        "Trying the new café? I'm down for that.",
        '去试试新咖啡馆？我赞成。',
      ],
      '不要在正式邮件中用它表示批准，也不要误解为情绪低落。',
      ['I would be happy to join.', '更完整、礼貌，适合半正式邀请。'],
    ),
    conciseExpression(
      'You do you.',
      'slang',
      '非正式回应语',
      ['按你喜欢的来', '你开心就好', '做你自己'],
      '表示尊重对方的个人选择；语调友好时是支持，冷淡时也可能带轻微讽刺。',
      [
        '风格选择',
        '朋友担心穿搭太特别。',
        'If you like the jacket, wear it. You do you.',
        '喜欢这件夹克就穿吧，按你喜欢的来。',
      ],
      [
        '游戏路线',
        '队友想尝试不同打法。',
        'I prefer stealth, but you do you.',
        '我更喜欢潜行，不过你按自己的打法来。',
      ],
      '避免对严肃困境随口使用，否则可能显得敷衍。',
      ['Choose what suits you best.', '更中性，也更适合提供建议。'],
    ),
    conciseExpression(
      'No hard feelings.',
      'idiom',
      '固定回应语',
      ['别往心里去', '没有芥蒂', '咱们还是没事'],
      '用于冲突、拒绝或竞争之后确认彼此没有怨气，重点是修复关系。',
      [
        '比赛结束',
        '朋友在对局中赢得很彻底。',
        'You crushed us, but no hard feelings.',
        '你们把我们打惨了，不过别担心，我们没芥蒂。',
      ],
      [
        '拒绝邀请',
        '无法参加朋友组织的活动。',
        'I cannot make it tonight—no hard feelings?',
        '我今晚来不了，你不会介意吧？',
      ],
      '它不能代替真正需要承担责任的道歉。',
      ['I hope there is no misunderstanding.', '更正式，适合澄清关系。'],
    ),
  ],
  [
    conciseExpression(
      'That checks out.',
      'slang',
      '非正式判断句',
      ['这说得通', '情况对得上', '逻辑没问题'],
      'check out 表示信息经过核对后合理或与证据一致。',
      [
        '核对时间',
        '朋友解释自己为什么迟到。',
        'The last train was delayed? That checks out.',
        '末班车晚点了？那就说得通了。',
      ],
      [
        '游戏机制',
        '数据与测试结果一致。',
        'The bonus only works at night. That checks out.',
        '加成只在夜间生效，数据对得上。',
      ],
      '不要与 check someone out 的“打量某人”混淆。',
      ['That explanation is consistent with the evidence.', '适合正式分析。'],
    ),
    conciseExpression(
      "Let's call it a day.",
      'idiom',
      '建议句；习语',
      ['今天就到这里吧', '收工吧', '先告一段落'],
      '表示当天的工作或活动已经足够，可以合理结束，而不是给某事命名。',
      [
        '学习结束',
        '复习时间已经很长。',
        "We've covered three chapters. Let's call it a day.",
        '我们已经复习三章了，今天就到这里吧。',
      ],
      [
        '游戏收尾',
        '大家状态开始下降。',
        "One last match, then let's call it a day.",
        '最后一局，然后就收工吧。',
      ],
      '不适合用来宣布项目永久取消，只表示暂时结束。',
      ['Let us stop here for today.', '意思直接，语气更中性。'],
    ),
    conciseExpression(
      "I'm on the fence.",
      'idiom',
      '状态表达；习语',
      ['我还没决定', '我有点犹豫', '我暂时不站边'],
      '想象坐在分界栅栏上，表示两边都有理由，暂时无法作出选择。',
      [
        '购买选择',
        '两个版本各有优点。',
        "Both editions look useful, so I'm still on the fence.",
        '两个版本看起来都实用，我还在犹豫。',
      ],
      [
        '观点讨论',
        '争议双方都有合理依据。',
        "I can see both sides; I'm on the fence.",
        '两边的理由我都理解，所以暂时不站边。',
      ],
      '它表示尚未决定，不等于完全没有意见。',
      ['I remain undecided.', '简洁正式，适合调查或讨论。'],
    ),
  ],
  [
    conciseExpression(
      'It slipped my mind.',
      'idiom',
      '说明句；习语',
      ['我一时忘了', '这事从我脑子里溜走了', '我给忘记了'],
      '用“从脑海滑走”的画面解释无意忘记，语气比 I forgot 更柔和。',
      [
        '忘记回复',
        '看到消息后被别的事打断。',
        'I meant to reply, but it slipped my mind.',
        '我本来想回复，但一忙就忘了。',
      ],
      [
        '遗漏任务',
        '约定的小事没有完成。',
        'Sorry, buying batteries completely slipped my mind.',
        '抱歉，我把买电池这事完全忘了。',
      ],
      '重复用它解释重要失误会显得推卸责任，应同时给出补救。',
      ['I inadvertently forgot.', '更正式，但日常使用略显书面。'],
    ),
    conciseExpression(
      'Give me a heads-up.',
      'idiom',
      '祈使句；非正式请求',
      ['提前告诉我一声', '先提醒我', '有变化通知我'],
      'heads-up 是提前预警或提醒，让对方有时间准备。',
      [
        '计划变化',
        '朋友可能会晚到。',
        'Give me a heads-up if the time changes.',
        '时间有变化就提前告诉我一声。',
      ],
      [
        '游戏组队',
        '队友准备突然开团。',
        'Give me a heads-up before you push.',
        '你推进之前先提醒我一下。',
      ],
      '它不表示详细汇报，只要求简短的提前通知。',
      ['Please let me know in advance.', '礼貌且适合正式安排。'],
    ),
    conciseExpression(
      "We're on the same page.",
      'idiom',
      '状态表达；习语',
      ['我们理解一致', '咱们想法对上了', '我们有共识'],
      '来自共同阅读同一页的画面，强调对目标、规则或下一步理解一致。',
      [
        '确认计划',
        '开始任务前核对分工。',
        "Let's make sure we're on the same page about the deadline.",
        '确认一下我们对截止时间的理解一致。',
      ],
      [
        '讨论战术',
        '队友的方案与你一致。',
        "Good, we're on the same page about defending first.",
        '很好，我们都同意先防守。',
      ],
      '观点一致不代表所有细节都已确定，必要时继续核对。',
      ['We have a shared understanding.', '更正式，适合会议纪要。'],
    ),
  ],
  [
    conciseExpression(
      'That rings a bell.',
      'idiom',
      '记忆回应；习语',
      ['听起来耳熟', '我好像记得', '这让我有点印象'],
      '表示信息触发了模糊记忆，但还不能确认完整细节。',
      [
        '提到名字',
        '朋友说出一位旧同学的名字。',
        'Maya Chen? That name rings a bell.',
        'Maya Chen？这个名字听起来有点耳熟。',
      ],
      [
        '游戏线索',
        '地点名称似乎曾经出现。',
        'The Old Harbor? That rings a bell.',
        '旧港口？这地方我好像有印象。',
      ],
      '它只表示模糊熟悉，不能用来声称自己确定知道。',
      ['That sounds familiar.', '意思直接，适用范围更广。'],
    ),
    conciseExpression(
      "Let's not jump to conclusions.",
      'phrase',
      '建议句；固定搭配',
      ['先别急着下结论', '别过早判断', '我们再看看证据'],
      'jump 强调从有限信息直接跳到最终判断，常用于缓和争论。',
      [
        '消息讨论',
        '只有一张未经证实的截图。',
        "We only have one screenshot; let's not jump to conclusions.",
        '我们只有一张截图，先别急着下结论。',
      ],
      [
        '排查故障',
        '问题原因尚未确认。',
        "The server is slow, but let's not jump to conclusions.",
        '服务器是慢了，不过先别急着判断原因。',
      ],
      '不要借此无限拖延；补充说明下一步需要什么证据。',
      [
        'Further evidence is needed before drawing a conclusion.',
        '适合正式论证。',
      ],
    ),
    conciseExpression(
      'I can work with that.',
      'response',
      '回应语；能力表达',
      ['这个条件我能接受', '这样可以操作', '我能在这个基础上继续'],
      '表示方案虽然未必完美，但已经足够可行，可以继续推进。',
      [
        '调整时间',
        '朋友只能晚半小时上线。',
        'You can join at nine? I can work with that.',
        '你九点能来？这个时间我能配合。',
      ],
      [
        '修改方案',
        '资源减少但仍能完成。',
        'Three examples instead of five? I can work with that.',
        '五个例子改成三个？这样也能做。',
      ],
      '它不是字面上的“和某物一起工作”，而是接受约束后的可行判断。',
      ['That arrangement is workable.', '更正式，适合项目沟通。'],
    ),
  ],
]

function expand(item: CompactExpression): PracticalExpression {
  return {
    expression: item.expression,
    expressionType: item.expressionType,
    partOfSpeech: item.partOfSpeech,
    chineseMeanings: item.chineseMeanings,
    coreMeaning: item.coreMeaning,
    usageNotes: item.usageNotes,
    scenarios: [item.first, item.second].map(
      ([label, description, example, exampleZh]) => ({
        label,
        description,
        example,
        exampleZh,
      }),
    ),
    pitfalls: item.pitfalls,
    alternatives: item.alternatives.map(([expression, nuance]) => ({
      expression,
      nuance,
    })),
    ieltsUse: item.ieltsUse,
  }
}

export function practicalExpressionGroup(index: number): PracticalExpression[] {
  const group = library[index % library.length]
  return group.map(expand)
}

export const practicalExpressionSeedCount = library.length
export const practicalExpressionCount = library.reduce(
  (total, group) => total + group.length,
  0,
)
