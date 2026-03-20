import { expect, Locator, Page, Response } from '@playwright/test';
import { dragBetweenLocators, dragLocatorByOffset } from '../utils/drag';
import { waitForQuietPeriod } from '../utils/polling';
import { waitForCanvasReady, waitForClickable, waitForVisible } from '../utils/wait';

export interface RunNodeResult {
  invokeCount: number;
  taskId: number;
  response: Response;
}

export class CanvasComponent {
  readonly page: Page;
  readonly canvasRoot: Locator;
  readonly promptTextarea: Locator;
  readonly sendButton: Locator;
  readonly uploadDialog: Locator;
  readonly uploadDialogCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.canvasRoot = page.locator('.react-flow').first();
    this.promptTextarea = page.getByPlaceholder('请输入内容...').first();
    this.sendButton = page.locator('div[class*="_sendButton_"]').last();
    this.uploadDialog = page.getByRole('dialog', { name: '文件上传' });
    this.uploadDialogCloseButton = page.getByRole('button', { name: /Close/ }).last();
  }

  nodeByType(type: string, index = 0): Locator {
    return this.page.locator(`.react-flow__node-${type}`).nth(index);
  }

  targetHandleByType(type: string, index = 0, handleIndex = 0): Locator {
    return this.nodeByType(type, index).locator('.react-flow__handle-left').nth(handleIndex);
  }

  sourceHandleByType(type: string, index = 0): Locator {
    return this.nodeByType(type, index).locator('.react-flow__handle-right').first();
  }

  async waitForReady(): Promise<void> {
    await waitForCanvasReady(this.page, 45_000);
    await waitForVisible(this.canvasRoot, 15_000);
  }

  async selectNode(type: string, index = 0): Promise<void> {
    const node = this.nodeByType(type, index);
    await waitForClickable(node, 15_000);
    await node.click();
  }

  async closeUploadDialogIfOpen(): Promise<void> {
    if (!(await this.uploadDialog.isVisible().catch(() => false))) {
      return;
    }

    await this.page.keyboard.press('Escape').catch(() => undefined);
    if (await this.uploadDialog.isVisible().catch(() => false)) {
      await this.uploadDialogCloseButton.click({ force: true });
    }
    await expect(this.uploadDialog).toBeHidden({ timeout: 10_000 });
  }

  async fillSelectedPrompt(prompt: string): Promise<void> {
    await waitForVisible(this.promptTextarea, 20_000);
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

  async readSelectedNodeCost(): Promise<number> {
    await waitForVisible(this.sendButton, 15_000);
    const text = (await this.sendButton.innerText()).trim();
    const cost = Number(text);
    if (!Number.isFinite(cost)) {
      throw new Error(`无法解析节点费用: ${text}`);
    }
    return cost;
  }

  async waitForSendEnabled(timeoutMs = 15_000): Promise<void> {
    await expect
      .poll(
        async () => (await this.sendButton.getAttribute('class')) ?? '',
        { timeout: timeoutMs, intervals: [500, 1_000] },
      )
      .not.toMatch(/_locked_/);
  }

  async runSelectedNode(clickCount = 1): Promise<RunNodeResult> {
    await this.waitForSendEnabled();

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

  async dragNodeByOffset(
    type: string,
    index: number,
    offsetX: number,
    offsetY: number,
  ): Promise<void> {
    const node = this.nodeByType(type, index);
    await waitForVisible(node, 15_000);
    await dragLocatorByOffset(this.page, node, offsetX, offsetY);
  }

  async connectNodes(options: {
    sourceType: string;
    sourceIndex?: number;
    targetType: string;
    targetIndex?: number;
    targetHandleIndex?: number;
  }): Promise<void> {
    const sourceHandle = this.sourceHandleByType(options.sourceType, options.sourceIndex ?? 0);
    const targetHandle = this.targetHandleByType(
      options.targetType,
      options.targetIndex ?? 0,
      options.targetHandleIndex ?? 0,
    );

    await waitForVisible(sourceHandle, 15_000);
    await waitForVisible(targetHandle, 15_000);
    await dragBetweenLocators(this.page, sourceHandle, targetHandle);
  }
}
