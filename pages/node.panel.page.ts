import { expect, Locator, Page, Response } from '@playwright/test';
import { waitForQuietPeriod } from '../utils/polling';
import { waitForVisible } from '../utils/wait';

export interface RunNodeResult {
  invokeCount: number;
  taskId: number;
  response: Response;
}

export interface RunNodeAttemptResult {
  accepted: boolean;
  invokeCount: number;
  taskId: number | null;
  response: Response | null;
  message: string | null;
  payload: unknown;
}

export interface CameraControlOptions {
  camera?: string;
  shot?: string;
  aperture?: string;
  focalLength?: string;
}

export class NodePanelPage {
  private static readonly modelComboboxIndex = 0;
  private static readonly resolutionComboboxIndex = 1;
  private static readonly aspectRatioComboboxIndex = 2;
  private static readonly generationCountComboboxIndex = 3;

  readonly page: Page;
  readonly promptTextarea: Locator;
  readonly sendButton: Locator;
  readonly modelCombobox: Locator;
  readonly cameraControlTrigger: Locator;
  readonly cameraControlPanel: Locator;
  readonly cameraControlOptionCards: Locator;
  readonly cameraControlSummary: Locator;
  readonly insufficientBalanceDialog: Locator;
  readonly insufficientBalanceDialogContent: Locator;
  readonly sensitiveContentHint: Locator;

  constructor(page: Page) {
    this.page = page;
    this.promptTextarea = page.getByPlaceholder('请输入内容...').first();
    this.sendButton = page.locator('[class*="_sendButton_"]').last();
    this.modelCombobox = page.locator('[role="combobox"]').first();
    this.cameraControlTrigger = page.locator('div.cursor-pointer').filter({ hasText: '摄影参数' }).first();
    this.cameraControlPanel = page
      .locator('div.absolute.bottom-full')
      .filter({ has: page.getByText('保存预设').first() })
      .last();
    this.cameraControlOptionCards = this.cameraControlPanel.locator(
      'div[class*="snap-center"][class*="cursor-pointer"]',
    );
    this.cameraControlSummary = this.cameraControlPanel
      .locator('div')
      .filter({ hasText: '摄像机' })
      .filter({ hasText: '镜头' })
      .filter({ hasText: '光圈' })
      .filter({ hasText: '焦段' })
      .first();
    this.insufficientBalanceDialog = page.getByRole('alertdialog', {
      name: '赛点余额不足，无法发起任务',
    });
    this.insufficientBalanceDialogContent = this.insufficientBalanceDialog.locator('p').first();
    this.sensitiveContentHint = page.getByText(/1005|敏感内容|请检查并重试/).first();
  }

  async isPanelReady(): Promise<boolean> {
    return (
      (await this.promptTextarea.isVisible().catch(() => false)) ||
      (await this.modelCombobox.isVisible().catch(() => false)) ||
      (await this.sendButton.isVisible().catch(() => false))
    );
  }

  async waitForPanelReady(timeoutMs = 20_000): Promise<void> {
    await expect
      .poll(async () => await this.isPanelReady(), {
        timeout: timeoutMs,
        intervals: [500, 1_000],
      })
      .toBeTruthy();
  }

  async waitForActionReady(timeoutMs = 20_000): Promise<void> {
    await this.waitForPanelReady(timeoutMs);
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

  async readModel(): Promise<string> {
    return this.readComboboxValue(NodePanelPage.modelComboboxIndex);
  }

  async selectModel(modelName: string): Promise<void> {
    await this.selectComboboxOption(NodePanelPage.modelComboboxIndex, modelName, '模型');
  }

  async readResolution(): Promise<string> {
    return this.readComboboxValue(NodePanelPage.resolutionComboboxIndex);
  }

  async selectResolution(resolution: string): Promise<void> {
    await this.selectComboboxOption(NodePanelPage.resolutionComboboxIndex, resolution, '分辨率');
  }

  async readAspectRatio(): Promise<string> {
    return this.readComboboxValue(NodePanelPage.aspectRatioComboboxIndex);
  }

  async selectAspectRatio(aspectRatio: string): Promise<void> {
    await this.selectComboboxOption(NodePanelPage.aspectRatioComboboxIndex, aspectRatio, '宽高比');
  }

  async readGenerationCount(): Promise<string> {
    return this.readComboboxValue(NodePanelPage.generationCountComboboxIndex);
  }

  async selectGenerationCount(generationCount: number | string): Promise<void> {
    await this.selectComboboxOption(
      NodePanelPage.generationCountComboboxIndex,
      this.formatGenerationCount(generationCount),
      '生成张数',
    );
  }

  async expectCameraControlVisible(timeoutMs = 10_000): Promise<void> {
    await expect(this.cameraControlTrigger).toBeVisible({ timeout: timeoutMs });
  }

  async isCameraControlExpanded(): Promise<boolean> {
    return await this.cameraControlPanel.isVisible().catch(() => false);
  }

  async openCameraControl(timeoutMs = 10_000): Promise<void> {
    await this.expectCameraControlVisible(timeoutMs);
    if (await this.isCameraControlExpanded()) {
      return;
    }

    const triggerCandidates = [
      this.cameraControlTrigger,
      this.page.getByText('摄影参数').first(),
      this.page.locator('div').filter({ hasText: '摄影参数' }).first(),
    ];

    for (const trigger of triggerCandidates) {
      await trigger.click({ force: true }).catch(() => undefined);
      if (await this.isCameraControlExpanded()) {
        return;
      }
    }

    await expect(this.cameraControlPanel).toBeVisible({ timeout: timeoutMs });
  }

  async closeCameraControl(timeoutMs = 10_000): Promise<void> {
    if (!(await this.isCameraControlExpanded())) {
      return;
    }

    await this.page
      .locator('div.fixed.inset-0.z-40')
      .first()
      .evaluate(element => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })
      .catch(() => undefined);
    if (await this.isCameraControlExpanded()) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
    }
    if (await this.isCameraControlExpanded()) {
      await this.promptTextarea.click({ force: true });
    }
    await expect
      .poll(async () => await this.isCameraControlExpanded(), {
        timeout: timeoutMs,
        intervals: [300, 500, 1_000],
      })
      .toBeFalsy();
  }

  async configureCameraControl(options: CameraControlOptions): Promise<void> {
    await this.openCameraControl();

    if (options.camera) {
      await this.selectCameraControlOption(options.camera);
      await expect(this.cameraControlSummary).toContainText(options.camera);
    }
    if (options.shot) {
      await this.selectCameraControlOption(options.shot);
      await expect(this.cameraControlSummary).toContainText(options.shot);
    }
    if (options.aperture) {
      await this.selectCameraControlOption(options.aperture);
      await expect(this.cameraControlSummary).toContainText(options.aperture);
    }
    if (options.focalLength) {
      await this.selectCameraControlOption(options.focalLength);
      await expect(this.cameraControlSummary).toContainText(options.focalLength);
    }

    await this.closeCameraControl();
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

  async waitForInsufficientBalanceDialog(timeoutMs = 10_000): Promise<void> {
    await expect(this.insufficientBalanceDialog).toBeVisible({ timeout: timeoutMs });
  }

  async readInsufficientBalanceDialogText(): Promise<string> {
    await this.waitForInsufficientBalanceDialog();
    return (await this.insufficientBalanceDialog.innerText()).trim();
  }

  async waitForSensitiveContentHint(timeoutMs = 30_000): Promise<void> {
    await expect(this.sensitiveContentHint).toBeVisible({ timeout: timeoutMs });
  }

  async readSensitiveContentHint(): Promise<string> {
    await this.waitForSensitiveContentHint();
    return (await this.sensitiveContentHint.innerText()).trim();
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
  }

  private async findOption(optionText: string): Promise<Locator> {
    const options = this.page.getByRole('option');
    await options.first().waitFor({ timeout: 15_000 });

    const count = await options.count();
    const normalizedTarget = this.normalizeText(optionText);
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const text = this.normalizeText((await option.innerText()).trim());
      if (text.includes(normalizedTarget)) {
        return option;
      }
    }

    throw new Error(`未找到下拉选项: ${optionText}`);
  }

  private comboboxByIndex(index: number): Locator {
    return this.page.locator('[role="combobox"]').nth(index);
  }

  private async readComboboxValue(index: number): Promise<string> {
    const combobox = this.comboboxByIndex(index);
    await waitForVisible(combobox, 15_000);
    return (await combobox.innerText()).trim();
  }

  private async selectComboboxOption(
    index: number,
    optionText: string,
    _fieldName: string,
  ): Promise<void> {
    const currentValue = await this.readComboboxValue(index);
    if (this.normalizeText(currentValue).includes(this.normalizeText(optionText))) {
      return;
    }

    const combobox = this.comboboxByIndex(index);
    await combobox.click();
    const option = await this.findOption(optionText);
    await option.click();

    await expect
      .poll(async () => this.normalizeText(await this.readComboboxValue(index)), {
        timeout: 15_000,
        intervals: [500, 1_000],
      })
      .toContain(this.normalizeText(optionText));
  }

  private formatGenerationCount(generationCount: number | string): string {
    if (typeof generationCount === 'number') {
      return `${generationCount}张`;
    }
    return generationCount.includes('张') ? generationCount : `${generationCount}张`;
  }

  private async selectCameraControlOption(optionText: string): Promise<void> {
    const option = this.cameraControlOptionCards.filter({ hasText: optionText }).first();
    await waitForVisible(option, 15_000);
    await Promise.all([
      this.page
        .waitForResponse(
          response =>
            response.url().includes('/game-ai-editor-center/api/canvas/partialUpdate') &&
            response.request().method() === 'POST',
          { timeout: 10_000 },
        )
        .catch(() => null),
      option.click({ force: true }),
    ]);
  }

  async runSelectedNode(clickCount = 1): Promise<RunNodeResult> {
    const result = await this.tryRunSelectedNode(clickCount, 15_000);
    if (!result.accepted || !result.response || result.taskId == null) {
      throw new Error('节点执行未收到 invoke 响应');
    }

    return {
      invokeCount: result.invokeCount,
      taskId: result.taskId,
      response: result.response,
    };
  }

  async tryRunSelectedNode(
    clickCount = 1,
    responseTimeoutMs = 15_000,
  ): Promise<RunNodeAttemptResult> {
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
      const firstInvokeResponse = this.page
        .waitForResponse(
          response =>
            response.url().includes('/game-ai-editor-center/api/v2/workflow/invoke') &&
            response.request().method() === 'POST',
          { timeout: responseTimeoutMs },
        )
        .catch(() => null);

      const clickTasks = Array.from({ length: clickCount }, () =>
        this.sendButton.click({ force: true }).catch(() => undefined),
      );
      await Promise.all(clickTasks);

      const invokeResponse = await firstInvokeResponse;
      await waitForQuietPeriod(
        () => Promise.resolve(matchedResponses.length),
        { quietMs: 1_000, timeoutMs: Math.max(3_000, responseTimeoutMs), intervalMs: 250 },
      );

      if (!invokeResponse) {
        return {
          accepted: false,
          invokeCount: matchedResponses.length,
          taskId: null,
          response: null,
          message: null,
          payload: null,
        };
      }

      const payload = await invokeResponse.json();
      const taskId =
        typeof payload?.data?.taskId === 'number' ? (payload.data.taskId as number) : null;
      const message =
        typeof payload?.msg === 'string'
          ? payload.msg
          : typeof payload?.message === 'string'
            ? payload.message
            : null;

      if (taskId == null) {
        return {
          accepted: false,
          invokeCount: matchedResponses.length,
          taskId: null,
          response: invokeResponse,
          message,
          payload,
        };
      }

      return {
        accepted: true,
        invokeCount: matchedResponses.length,
        taskId,
        response: invokeResponse,
        message,
        payload,
      };
    } finally {
      this.page.off('response', responseListener);
    }
  }
}
