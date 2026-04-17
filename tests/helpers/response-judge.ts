import { expect, TestInfo } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ResponseJudgeFlow } from '../../flows/response-judge.flow';
import { aiConfig } from '../../utils/ai/ai.config';

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'unknown';
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function judgeAndAssertResponseQuality(options: {
  testInfo: TestInfo;
  moduleName: 'agent' | 'group';
  scenarioName: string;
  roleName: string;
  userPrompt: string;
  replyText: string;
}): Promise<void> {
  const judgeFlow = new ResponseJudgeFlow();
  const report = await judgeFlow.judgeReply({
    moduleName: options.moduleName,
    scenarioName: options.scenarioName,
    roleName: options.roleName,
    userPrompt: options.userPrompt,
    replyText: options.replyText,
  });

  if (!report) {
    return;
  }

  const artifactDir = path.resolve(
    process.cwd(),
    'test-results',
    'ai-response-judge',
    sanitizePathSegment(options.testInfo.project.name),
    sanitizePathSegment(options.moduleName),
    sanitizePathSegment(options.scenarioName),
  );
  await ensureDir(artifactDir);

  const reportFile = path.join(
    artifactDir,
    `${sanitizePathSegment(options.roleName)}-judge-report.json`,
  );
  const replyFile = path.join(
    artifactDir,
    `${sanitizePathSegment(options.roleName)}-reply.txt`,
  );

  const persistedReport = {
    createdAt: new Date().toISOString(),
    moduleName: options.moduleName,
    scenarioName: options.scenarioName,
    roleName: options.roleName,
    projectName: options.testInfo.project.name,
    prompt: options.userPrompt,
    replyText: options.replyText,
    report,
  };

  await fs.writeFile(reportFile, JSON.stringify(persistedReport, null, 2), 'utf8');
  await fs.writeFile(replyFile, options.replyText || '[empty]', 'utf8');

  await options.testInfo.attach(`${options.moduleName}-${options.roleName}-AI回复判断`, {
    path: reportFile,
    contentType: 'application/json',
  });
  await options.testInfo.attach(`${options.moduleName}-${options.roleName}-原始回复`, {
    path: replyFile,
    contentType: 'text/plain',
  });

  expect.soft(options.replyText.trim().length).toBeGreaterThan(0);

  if (aiConfig.responseJudge.mode === 'assert') {
    expect(
      report.verdict,
      `AI 判定回复不规范: ${report.summary}; issues=${report.issues.join(' | ')}`,
    ).not.toBe('fail');
  }
}
