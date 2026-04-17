import { LlmApi } from '../api/llm.api';
import { aiConfig, isAiResponseJudgeEnabled } from '../utils/ai/ai.config';
import { buildResponseJudgeMessages, RESPONSE_JUDGE_PROMPT_VERSION } from '../utils/ai/response-judge.prompt';
import { AiCriterionVerdict, AiResponseJudgeReport } from '../utils/ai/ai.types';

function normalizeVerdict(value: string): AiCriterionVerdict {
  if (value === 'fail') {
    return 'fail';
  }
  if (value === 'review') {
    return 'review';
  }
  return 'pass';
}

function parseList(value: string): string[] {
  return value
    .split('|')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseResultBlock(rawText: string): Record<string, string> {
  const match = rawText.match(/<<RESULT>>([\s\S]*?)<<\/RESULT>>/i);
  if (!match?.[1]) {
    throw new Error(`LLM 未返回可解析的结果块: ${rawText.slice(0, 300)}`);
  }

  const lines = match[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const result: Record<string, string> = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
}

export class ResponseJudgeFlow {
  constructor(private readonly llmApi: LlmApi | null = LlmApi.createForResponseJudge()) {}

  async judgeReply(input: {
    moduleName: 'agent' | 'group';
    scenarioName: string;
    roleName: string;
    userPrompt: string;
    replyText: string;
  }): Promise<AiResponseJudgeReport | null> {
    if (!isAiResponseJudgeEnabled() || !this.llmApi) {
      return null;
    }

    try {
      const completion = await this.llmApi.completeText(
        buildResponseJudgeMessages(input),
        { temperature: 0.1, maxTokens: 900 },
      );
      const parsed = parseResultBlock(completion.rawText);
      const report: AiResponseJudgeReport = {
        verdict: normalizeVerdict(parsed.verdict),
        confidence: Number.isFinite(Number(parsed.confidence))
          ? Math.max(0, Math.min(1, Number(parsed.confidence)))
          : 0,
        summary: parsed.summary || 'LLM 未返回总结',
        strengths: parseList(parsed.strengths ?? ''),
        issues: parseList(parsed.issues ?? ''),
        criteria: {
          relevance: normalizeVerdict(parsed.relevance),
          clarity: normalizeVerdict(parsed.clarity),
          completeness: normalizeVerdict(parsed.completeness),
          actionability: normalizeVerdict(parsed.actionability),
          professionalism: normalizeVerdict(parsed.professionalism),
        },
        model: this.llmApi.model,
        mode: aiConfig.responseJudge.mode,
        rawText: completion.rawText,
        promptVersion: RESPONSE_JUDGE_PROMPT_VERSION,
        error: null,
      };
      return report;
    } catch (error) {
      return {
        verdict: 'review',
        confidence: 0,
        summary: 'AI 回复质量审计执行失败',
        strengths: [],
        issues: ['模型调用失败，本次仅保留原始回复文本供人工查看'],
        criteria: {
          relevance: 'review',
          clarity: 'review',
          completeness: 'review',
          actionability: 'review',
          professionalism: 'review',
        },
        model: this.llmApi.model,
        mode: aiConfig.responseJudge.mode,
        rawText: '',
        promptVersion: RESPONSE_JUDGE_PROMPT_VERSION,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
