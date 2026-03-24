import { expect, Locator, Page, Response } from '@playwright/test';
import { waitForQuietPeriod } from '../utils/polling';
import { waitForVisible } from '../utils/wait';

export interface RunNodeResult {
  invokeCount: number;
  taskId: number;
  response: Response;
}

export class NodePanelPage {
  readonly page: Page;
  readonly promptTextarea: Locator;
  readonly sendButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.promptTextarea = page.getByPlaceholder('请输入内容...').first();
    this.sendButton = page.locator('div[class*="_sendButton_"]').last();
  }

  async waitForActionReady(timeoutMs = 20_000): Promise<void> {
    await waitForVisible(this.sendButton, timeoutMs);
  }

  async waitForPromptReady(timeoutMs = 20_000): Promise<void> {
    await waitForVisible(this.promptTextarea, timeoutMs);
  }

  async fillPrompt(prompt: string): Promise<void> {
    await this.waitForPromptReady();
    await Promise.all([
      this.page.waitForResponse(
        response =>
          response.url().includes('/game-ai-editor-center/api/canvas/partialUpdate') &&
          response.request().method() === 'POST',
        { timeout: 10_000 },
      ),
      this.promptTextarea.fill(prompt),
    ]);
  }

  async readCost(): Promise<number> {
    await this.waitForActionReady(15_000);
    const text = (await this.sendButton.innerText()).trim();
    const cost = Number(text);
    if (!Number.isFinite(cost)) {
      throw new Error(`无法解析节点费用: ${text}`);
    }
    return cost;
  }

  async waitForRunEnabled(timeoutMs = 15_000): Promise<void> {
    await this.waitForActionReady(timeoutMs);
    await expect
      .poll(
        async () => (await this.sendButton.getAttribute('class')) ?? '',
        { timeout: timeoutMs, intervals: [500, 1_000] },
      )
      .not.toMatch(/_locked_/);
  }

  async getRunButtonClass(): Promise<string> {
    await this.waitForActionReady(15_000);
    return (await this.sendButton.getAttribute('class')) ?? '';
  }

  async isRunLocked(): Promise<boolean> {
    return /_locked_/.test(await this.getRunButtonClass());
  }

  async expectRunLocked(timeoutMs = 10_000): Promise<void> {
    await expect
      .poll(
        async () => await this.getRunButtonClass(),
        { timeout: timeoutMs, intervals: [500, 1_000] },
      )
      .toMatch(/_locked_/);
  }

  async runSelectedNode(clickCount = 1): Promise<RunNodeResult> {
    await this.waitForRunEnabled();

    const matchedResponses: Response[] = [];
    const responseListener = (response: Response) => {
      if (
        response.url().includes('/game-ai-editor-center/api/v2/workflow/invoke') &&
        response.request().method() === 'POST'
      ) {
        matchedResponses.push(response);
      }
    };

    this.page.on('response', responseListener);

    try {
      const firstInvokeResponse = this.page.waitForResponse(
        response =>
          response.url().includes('/game-ai-editor-center/api/v2/workflow/invoke') &&
          response.request().method() === 'POST',
        { timeout: 15_000 },
      );

      const clickTasks = Array.from({ length: clickCount }, () =>
        this.sendButton.click().catch(() => undefined),
      );
      await Promise.all(clickTasks);

      const invokeResponse = await firstInvokeResponse;
      await waitForQuietPeriod(
        () => Promise.resolve(matchedResponses.length),
        { quietMs: 1_000, timeoutMs: 6_000, intervalMs: 250 },
      );

      const payload = await invokeResponse.json();
      return {
        invokeCount: matchedResponses.length,
        taskId: payload.data.taskId as number,
        response: invokeResponse,
      };
    } finally {
      this.page.off('response', responseListener);
    }
  }
}
