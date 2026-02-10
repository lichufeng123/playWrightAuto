// skills/locator_suggest.skill.ts

export interface LocatorSuggestion {
    locator: string;
    basis: string;        // 依据：role / aria / text / attribute
    stability: 'HIGH' | 'MEDIUM' | 'LOW';
    risk: string;
}

export interface LocatorSuggestInput {
    targetDescription: string;   // 如：发送按钮
    dom: string;
    screenshotBase64: string;
}

export async function suggestLocators(
    input: LocatorSuggestInput
): Promise<LocatorSuggestion[]> {
    /**
     * ⚠️ 注意：
     * 这里不直接写死模型调用。
     * 你可以：
     * - 接 OpenAI / 内部模型
     * - 或直接把 prompt + input 丢给 Cursor / Antigravity
     */

    const prompt = `
你是一名资深 Playwright UI 自动化工程师。

目标元素：${input.targetDescription}

【规则】
- 优先 getByRole / aria / data-testid
- 禁止 nth-child / 样式类 / 过深 CSS
- 需支持并行执行与数据变化

请基于提供的 DOM 和截图，
生成 3–5 个 Playwright locator 候选，
并给出稳定性评级与风险说明。

【输出 JSON 格式】
[
  {
    "locator": "page.getByRole('button', { name: /发送/i })",
    "basis": "role + accessible name",
    "stability": "HIGH",
    "risk": "依赖文案，需注意国际化"
  }
]
`;

    // TODO: 在这里接你的 AI 调用
    // const result = await callLLM(prompt, input);

    // 临时占位（避免误用）
    throw new Error(
        'suggestLocators 是 AI Skill，占位实现。请在此处接入你的 AI 调用。'
    );
}
