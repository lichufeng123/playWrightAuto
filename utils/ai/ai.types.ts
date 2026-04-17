export type AiCriterionVerdict = 'pass' | 'review' | 'fail';

export interface AiResponseJudgeCriteria {
  relevance: AiCriterionVerdict;
  clarity: AiCriterionVerdict;
  completeness: AiCriterionVerdict;
  actionability: AiCriterionVerdict;
  professionalism: AiCriterionVerdict;
}

export interface AiResponseJudgeResult {
  verdict: AiCriterionVerdict;
  confidence: number;
  summary: string;
  strengths: string[];
  issues: string[];
  criteria: AiResponseJudgeCriteria;
}

export interface AiResponseJudgeReport extends AiResponseJudgeResult {
  model: string;
  mode: 'audit' | 'assert';
  rawText: string;
  promptVersion: string;
  error?: string | null;
}
