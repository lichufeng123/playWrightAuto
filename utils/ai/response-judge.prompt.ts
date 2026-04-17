export const RESPONSE_JUDGE_PROMPT_VERSION = 'v1';

export function buildResponseJudgeMessages(input: {
  moduleName: 'agent' | 'group';
  scenarioName: string;
  roleName: string;
  userPrompt: string;
  replyText: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        '你是 UI 自动化中的文本回复质量审计助手。',
        '你的任务是判断智能体回复是否“规范”。',
        '规范标准如下：',
        '1. 与用户问题强相关，不跑题。',
        '2. 表达清晰，没有乱码、空话、明显重复或占位符。',
        '3. 对策略/分析/方案类问题，回复应至少覆盖两个以上关键维度，不能只敷衍一句。',
        '4. 具有可执行性，最好给出分点、步骤、建议或框架。',
        '5. 专业且自然，不自相矛盾，不出现明显不合理拒答。',
        '请在回答最后输出如下结构，使用英文标签，便于程序解析：',
        '<<RESULT>>',
        'verdict=pass|review|fail',
        'confidence=0-1之间的小数',
        'summary=一句中文总结',
        'relevance=pass|review|fail',
        'clarity=pass|review|fail',
        'completeness=pass|review|fail',
        'actionability=pass|review|fail',
        'professionalism=pass|review|fail',
        'strengths=优点1 | 优点2',
        'issues=问题1 | 问题2',
        '<</RESULT>>',
        '除了必要分析外，必须保证最后存在完整的 <<RESULT>> 块。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `promptVersion=${RESPONSE_JUDGE_PROMPT_VERSION}`,
        `module=${input.moduleName}`,
        `scenario=${input.scenarioName}`,
        `roleName=${input.roleName}`,
        '',
        'userPrompt:',
        input.userPrompt,
        '',
        'replyText:',
        input.replyText,
      ].join('\n'),
    },
  ];
}
