// skills/failure_triage.skill.ts

export type FailureCategory =
    | 'LOCATOR_BROKEN'
    | 'WAIT_STRATEGY'
    | 'DATA_DEPENDENCY'
    | 'PERMISSION'
    | 'NETWORK_SLOW'
    | 'UNKNOWN';

export interface FailureAnalysis {
    category: FailureCategory;
    summary: string;
    evidence: string[];
    suggestion: string;
}

export interface FailureTriageInput {
    testName: string;
    errorMessage: string;
    dom?: string;
    screenshotBase64?: string;
    consoleErrors?: string[];
}

export async function analyzeFailure(
    input: FailureTriageInput
): Promise<FailureAnalysis> {
    const prompt = `
你是一名资深 UI 自动化测试工程师，擅长分析 Playwright 测试失败。

【测试名称】
${input.testName}

【错误信息】
${input.errorMessage}

【规则】
- 只从工程角度分析
- 不猜测业务逻辑
- 给出“最小修改建议”
- 不建议重构

请输出以下 JSON：
{
  "category": "LOCATOR_BROKEN | WAIT_STRATEGY | DATA_DEPENDENCY | PERMISSION | NETWORK_SLOW | UNKNOWN",
  "summary": "一句话总结失败原因",
  "evidence": ["支持判断的线索"],
  "suggestion": "最小修复建议"
}
`;

    // TODO: 在这里接 AI
    // const result = await callLLM(prompt, input);

    throw new Error(
        'analyzeFailure 是 AI Skill，占位实现。请在此处接入你的 AI 调用。'
    );
}
