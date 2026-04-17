export type AiResponseJudgeMode = 'off' | 'audit' | 'assert';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function parseBoolean(value: string, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeResponseJudgeMode(value: string): AiResponseJudgeMode {
  if (value === 'off') {
    return 'off';
  }
  if (value === 'audit') {
    return 'audit';
  }
  return 'assert';
}

const baseUrl = readEnv('AI_BASE_URL');
const apiKey = readEnv('AI_API_KEY');
const defaultModel = readEnv('AI_MODEL');
const responseJudgeModel =
  readEnv('AI_RESPONSE_JUDGE_MODEL') || readEnv('AI_JUDGE_MODEL') || defaultModel;

export const aiConfig = {
  enabled: parseBoolean(readEnv('AI_ENABLED'), false),
  baseUrl,
  apiKey,
  allowContextUpload: parseBoolean(readEnv('AI_ALLOW_CONTEXT_UPLOAD'), false),
  responseJudge: {
    mode: normalizeResponseJudgeMode(readEnv('AI_RESPONSE_JUDGE_MODE') || readEnv('AI_JUDGE_MODE')),
    model: responseJudgeModel,
    timeoutMs: parseNumber(
      readEnv('AI_RESPONSE_JUDGE_TIMEOUT_MS') || readEnv('AI_JUDGE_TIMEOUT_MS'),
      45_000,
    ),
  },
};

export function hasAiCredentials(): boolean {
  return Boolean(aiConfig.baseUrl && aiConfig.apiKey);
}

export function isAiResponseJudgeEnabled(): boolean {
  return (
    aiConfig.enabled &&
    hasAiCredentials() &&
    aiConfig.responseJudge.mode !== 'off' &&
    Boolean(aiConfig.responseJudge.model)
  );
}

export function getSanitizedAiConfig(): Record<string, unknown> {
  return {
    enabled: aiConfig.enabled,
    baseUrl: aiConfig.baseUrl,
    allowContextUpload: aiConfig.allowContextUpload,
    responseJudge: {
      ...aiConfig.responseJudge,
      enabled: isAiResponseJudgeEnabled(),
    },
  };
}
