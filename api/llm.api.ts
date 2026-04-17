import { aiConfig } from '../utils/ai/ai.config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function extractContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(item => item?.text ?? '')
    .filter(Boolean)
    .join('\n');
}

function extractJsonString(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('LLM 返回为空');
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fencedMatch?.[1]) {
    JSON.parse(fencedMatch[1]);
    return fencedMatch[1];
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const maybeJson = trimmed.slice(firstBrace, lastBrace + 1);
    JSON.parse(maybeJson);
    return maybeJson;
  }

  throw new Error(`无法从 LLM 返回中提取 JSON: ${trimmed.slice(0, 200)}`);
}

export class LlmApi {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
    },
  ) {}

  static createForResponseJudge(): LlmApi | null {
    const model = aiConfig.responseJudge.model;
    const timeoutMs = aiConfig.responseJudge.timeoutMs;

    if (!aiConfig.enabled || !aiConfig.baseUrl || !aiConfig.apiKey || !model) {
      return null;
    }

    return new LlmApi({
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      model,
      timeoutMs,
    });
  }

  get model(): string {
    return this.options.model;
  }

  async completeText(
    messages: LlmMessage[],
    options?: {
      temperature?: number;
      timeoutMs?: number;
      maxTokens?: number;
    },
  ): Promise<{ rawText: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('LLM 请求超时')),
      options?.timeoutMs ?? this.options.timeoutMs,
    );

    try {
      const response = await fetch(joinUrl(this.options.baseUrl, '/chat/completions'), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          temperature: options?.temperature ?? 0.1,
          max_tokens: options?.maxTokens ?? 1200,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM 请求失败: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return {
        rawText: extractContent(data.choices?.[0]?.message?.content),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async completeJson<T>(
    messages: LlmMessage[],
    options?: {
      temperature?: number;
      timeoutMs?: number;
      maxTokens?: number;
    },
  ): Promise<{ rawText: string; parsed: T }> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error('LLM 请求超时')),
      options?.timeoutMs ?? this.options.timeoutMs,
    );

    try {
      const { rawText } = await this.completeText(messages, options);
      const jsonText = extractJsonString(rawText);
      return {
        rawText,
        parsed: JSON.parse(jsonText) as T,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
