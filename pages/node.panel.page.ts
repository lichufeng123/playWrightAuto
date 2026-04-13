import { expect, Locator, Page, Response } from '@playwright/test';
import { SectionPanelComponent } from '../components/section-panel.component';
import { SelectFieldComponent } from '../components/select-field.component';
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

/**
 * 节点参数面板页对象。
 * 这里集中兜住 workflow 右侧参数区最容易漂移的 DOM 结构，避免 spec 直接依赖元素顺序。
 */
export class NodePanelPage {
  // 新版 UI 会把“分辨率 + 宽高比”合并成一个触发器，文案通常类似 “1K · 1:1”。
  private static readonly resolutionAspectPattern = /\d+\s*[kK].*[0-9]+:[0-9]+/;

  readonly page: Page;
  readonly promptTextarea: Locator;
  readonly sendButton: Locator;
  readonly modelField: SelectFieldComponent;
  readonly resolutionAspectField: SelectFieldComponent;
  readonly legacyResolutionField: SelectFieldComponent;
  readonly legacyAspectRatioField: SelectFieldComponent;
  readonly generationCountField: SelectFieldComponent;
  readonly resolutionAspectPanel: SectionPanelComponent;
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
    this.modelField = new SelectFieldComponent(page, () => this.page.locator('[role="combobox"]').first());
    this.resolutionAspectPanel = new SectionPanelComponent(page, () => this.combinedResolutionAspectPanel());
    // 新版合并控件有时是 button，有时又退回 combobox，这里给多个候选触发器兜底。
    this.resolutionAspectField = new SelectFieldComponent(
      page,
      () => [
        this.page.getByRole('button', { name: NodePanelPage.resolutionAspectPattern }).first(),
        this.page.locator('button').filter({ hasText: NodePanelPage.resolutionAspectPattern }).first(),
        this.page.locator('[role="combobox"]').filter({
          hasText: NodePanelPage.resolutionAspectPattern,
        }).first(),
      ],
      {
        popupLocator: () => this.resolutionAspectPanel.locator(),
      },
    );
    this.legacyResolutionField = new SelectFieldComponent(
      page,
      () => this.page.locator('[role="combobox"]').nth(1),
    );
    this.legacyAspectRatioField = new SelectFieldComponent(
      page,
      () => this.page.locator('[role="combobox"]').nth(2),
    );
    // 生成张数在不同节点类型里所在顺序不稳定，优先按文本特征找，再回退顺序索引。
    this.generationCountField = new SelectFieldComponent(
      page,
      () => [
        this.page.locator('[role="combobox"]').filter({ hasText: /\d+\s*张/ }).first(),
        this.page.locator('[role="combobox"]').nth(2),
        this.page.locator('[role="combobox"]').nth(3),
      ],
    );
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

  /**
   * 判断右侧节点参数面板是否处于可操作状态。
   *
   * 只要提示词输入框、模型字段、执行按钮里任意一个核心控件可见，
   * 就认为这个面板已经恢复到可继续操作的状态。
   */
  async isPanelReady(): Promise<boolean> {
    return (
      // 不同节点的参数区长得不完全一样，只要核心输入或执行控件可见，就算面板已恢复。
      (await this.promptTextarea.isVisible().catch(() => false)) ||
      (await this.modelField.isVisible()) ||
      (await this.sendButton.isVisible().catch(() => false))
    );
  }

  /**
   * 等待参数面板恢复可操作。
   */
  async waitForPanelReady(timeoutMs = 20_000): Promise<void> {
    await expect
      .poll(async () => await this.isPanelReady(), {
        timeout: timeoutMs,
        intervals: [500, 1_000],
      })
      .toBeTruthy();
  }

  /**
   * 等待执行按钮所在区域可操作。
   */
  async waitForActionReady(timeoutMs = 20_000): Promise<void> {
    await this.waitForPanelReady(timeoutMs);
    await waitForVisible(this.sendButton, timeoutMs);
  }

  /**
   * 等待提示词输入框可用。
   */
  async waitForPromptReady(timeoutMs = 20_000): Promise<void> {
    await waitForVisible(this.promptTextarea, timeoutMs);
  }

  /**
   * 填写提示词，并等待 partialUpdate 落库。
   */
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

  /**
   * 读取当前模型文案。
   */
  async readModel(): Promise<string> {
    return this.modelField.readValue();
  }

  /**
   * 切换模型。
   */
  async selectModel(modelName: string): Promise<void> {
    await this.modelField.selectOption(modelName, 15_000);
  }

  /**
   * 读取当前分辨率。
   *
   * 新版 UI 走合并控件；
   * 老版 UI 走独立分辨率字段。
   */
  async readResolution(): Promise<string> {
    if (await this.resolutionAspectField.isVisible()) {
      return this.parseResolutionAspect(await this.resolutionAspectField.readValue()).resolution;
    }
    return this.legacyResolutionField.readValue();
  }

  /**
   * 设置分辨率。
   */
  async selectResolution(resolution: string): Promise<void> {
    if (await this.resolutionAspectField.isVisible()) {
      await this.selectResolutionAspectOption('分辨率', resolution, async () => await this.readResolution());
      return;
    }
    await this.legacyResolutionField.selectOption(resolution, 15_000);
  }

  /**
   * 读取当前宽高比。
   */
  async readAspectRatio(): Promise<string> {
    if (await this.resolutionAspectField.isVisible()) {
      return this.parseResolutionAspect(await this.resolutionAspectField.readValue()).aspectRatio;
    }
    return this.legacyAspectRatioField.readValue();
  }

  /**
   * 设置宽高比。
   */
  async selectAspectRatio(aspectRatio: string): Promise<void> {
    if (await this.resolutionAspectField.isVisible()) {
      await this.selectResolutionAspectOption(
        '宽高比',
        aspectRatio,
        async () => await this.readAspectRatio(),
      );
      return;
    }
    await this.legacyAspectRatioField.selectOption(aspectRatio, 15_000);
  }

  /**
   * 读取当前生成张数文案。
   */
  async readGenerationCount(): Promise<string> {
    return this.generationCountField.readValue();
  }

  /**
   * 设置生成张数。
   */
  async selectGenerationCount(generationCount: number | string): Promise<void> {
    await this.generationCountField.selectOption(
      this.formatGenerationCount(generationCount),
      15_000,
    );
  }

  /**
   * 断言摄影参数入口当前可见。
   */
  async expectCameraControlVisible(timeoutMs = 10_000): Promise<void> {
    await expect(this.cameraControlTrigger).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * 判断摄影参数面板是否已经展开。
   */
  async isCameraControlExpanded(): Promise<boolean> {
    return await this.cameraControlPanel.isVisible().catch(() => false);
  }

  /**
   * 打开摄影参数面板。
   */
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

    // 摄影参数入口在不同版本里包裹层级不一样，按候选顺序逐个尝试比写死一个 locator 稳。
    for (const trigger of triggerCandidates) {
      await trigger.click({ force: true }).catch(() => undefined);
      if (await this.isCameraControlExpanded()) {
        return;
      }
    }

    await expect(this.cameraControlPanel).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * 关闭摄影参数面板。
   *
   * 这里按“点击遮罩 -> Escape -> 点回输入框”的顺序兜底，
   * 因为不同版本对关闭手势的支持不完全一致。
   */
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

  /**
   * 一次性配置摄影参数。
   */
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

  /**
   * 读取当前节点的赛点消耗。
   */
  async readCost(): Promise<number> {
    await this.waitForActionReady(15_000);
    const text = (await this.sendButton.innerText()).trim();
    const cost = Number(text);
    if (!Number.isFinite(cost)) {
      throw new Error(`无法解析节点费用: ${text}`);
    }
    return cost;
  }

  /**
   * 等待执行按钮解锁。
   */
  async waitForRunEnabled(timeoutMs = 15_000): Promise<void> {
    await this.waitForActionReady(timeoutMs);
    await expect
      .poll(
        async () => (await this.sendButton.getAttribute('class')) ?? '',
        { timeout: timeoutMs, intervals: [500, 1_000] },
      )
      .not.toMatch(/_locked_/);
  }

  /**
   * 读取执行按钮 class，用来判断锁定态。
   */
  async getRunButtonClass(): Promise<string> {
    await this.waitForActionReady(15_000);
    return (await this.sendButton.getAttribute('class')) ?? '';
  }

  /**
   * 判断执行按钮是否锁定。
   */
  async isRunLocked(): Promise<boolean> {
    return /_locked_/.test(await this.getRunButtonClass());
  }

  /**
   * 断言执行按钮处于锁定态。
   */
  async expectRunLocked(timeoutMs = 10_000): Promise<void> {
    await expect
      .poll(
        async () => await this.getRunButtonClass(),
        { timeout: timeoutMs, intervals: [500, 1_000] },
      )
      .toMatch(/_locked_/);
  }

  /**
   * 等待余额不足弹窗出现。
   */
  async waitForInsufficientBalanceDialog(timeoutMs = 10_000): Promise<void> {
    await expect(this.insufficientBalanceDialog).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * 读取余额不足弹窗里的文案。
   */
  async readInsufficientBalanceDialogText(): Promise<string> {
    await this.waitForInsufficientBalanceDialog();
    return (await this.insufficientBalanceDialog.innerText()).trim();
  }

  /**
   * 等待敏感内容提示出现。
   */
  async waitForSensitiveContentHint(timeoutMs = 30_000): Promise<void> {
    await expect(this.sensitiveContentHint).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * 读取敏感内容提示文案。
   */
  async readSensitiveContentHint(): Promise<string> {
    await this.waitForSensitiveContentHint();
    return (await this.sensitiveContentHint.innerText()).trim();
  }

  /**
   * 执行节点，并要求必须收到成功的 invoke 响应。
   */
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

  /**
   * 尝试执行节点，并把 invoke 请求的结果完整返回。
   *
   * 适合需要区分：
   * - 真正发起成功
   * - 被前端锁定
   * - 接口返回失败但仍有响应
   */
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
      // 除了等待第一条 invoke 响应，还额外统计全部命中响应，方便验证连点是否真的多次发起。
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

  /**
   * 统一做文本归一化，避免因为空格、大小写不同导致误判。
   */
  private normalizeText(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
  }

  private combinedResolutionAspectPanel(): Locator {
    // 合并面板没有稳定语义属性，只能通过“同时包含分辨率和宽高比文本”的容器去锁定。
    return this.page
      .locator('div[role="dialog"], div.absolute, div.fixed, div[class*="popover"], div[class*="panel"], div')
      .filter({ hasText: '分辨率' })
      .filter({ hasText: '宽高比' })
      .last();
  }

  /**
   * 把类似 `1K · 1:1` 的合并文案拆成分辨率和宽高比。
   */
  private parseResolutionAspect(value: string): {
    resolution: string;
    aspectRatio: string;
  } {
    const [resolution = '', aspectRatio = ''] = value.split(/[·•]/).map(text => text.trim());
    return { resolution, aspectRatio };
  }

  /**
   * 在合并面板里选择“分辨率”或“宽高比”。
   *
   * 参数说明：
   * - sectionTitle：去哪个分组里找，例如“分辨率”
   * - optionText：目标选项文案
   * - reader：切换后怎么读取当前值，由调用方传进来
   */
  private async selectResolutionAspectOption(
    sectionTitle: string,
    optionText: string,
    reader: () => Promise<string>,
  ): Promise<void> {
    const currentValue = await reader();
    if (this.normalizeText(currentValue).includes(this.normalizeText(optionText))) {
      return;
    }

    if (!(await this.resolutionAspectPanel.isVisible())) {
      await this.resolutionAspectField.open(15_000);
    }
    await this.resolutionAspectPanel.selectOption(sectionTitle, optionText, 15_000);
    // 真正以当前展示值为准，避免点击成功了但面板状态还没同步就继续往下跑。
    await expect
      .poll(async () => this.normalizeText(await reader()), {
        timeout: 15_000,
        intervals: [500, 1_000],
      })
      .toContain(this.normalizeText(optionText));
  }

  /**
   * 把张数统一格式化成页面使用的文案，例如 `2张`。
   */
  private formatGenerationCount(generationCount: number | string): string {
    if (typeof generationCount === 'number') {
      return `${generationCount}张`;
    }
    return generationCount.includes('张') ? generationCount : `${generationCount}张`;
  }

  /**
   * 在摄影参数弹层里点击某个具体选项，并等待配置接口落库。
   */
  private async selectCameraControlOption(optionText: string): Promise<void> {
    const option = this.cameraControlOptionCards.filter({ hasText: optionText }).first();
    await waitForVisible(option, 15_000);
    await Promise.all([
      this.page
        // 摄影参数选项会走 partialUpdate，等接口返回比裸点一下更能确认配置真的落库了。
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
}
