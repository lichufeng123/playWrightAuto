import { expect, Page, TestInfo } from '@playwright/test';
import { AssetApi, AssetKind, AssetSnapshot } from '../api/asset.api';
import { BillingApi } from '../api/billing.api';
import { CanvasSnapshot, TaskApi } from '../api/task.api';
import { CameraControlOptions } from '../pages/node.panel.page';
import { WorkflowEditorPage } from '../pages/workflow.editor.page';
import { WorkflowPage } from '../pages/workflow.page';
import { enterWorkflowPage } from '../tests/helpers/navigation';
import { StepLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';

export interface AddWorkflowNodeOptions {
  nodeLabel: string;
  nodeType: string;
  prompt?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  generationCount?: number | string;
  cameraControl?: CameraControlOptions;
}

/**
 * Workflow 业务编排层。
 * 这里负责把项目页、画布页和 API 校验串成完整业务动作，spec 不再直接摸底层 DOM 细节。
 */
export class WorkflowFlow {
  private _workflowPage: WorkflowPage | null = null;
  private _editorPage: WorkflowEditorPage | null = null;
  private _taskApi: TaskApi | null = null;
  private _billingApi: BillingApi | null = null;
  private _assetApi: AssetApi | null = null;
  readonly logger: StepLogger;

  constructor(
    private readonly page: Page,
    testInfo?: TestInfo,
  ) {
    this.logger = new StepLogger(page, testInfo, 'workflow');
  }

  /**
   * 统一暴露项目页实例。
   *
   * 这里做非空校验，是为了防止上层忘了先调用 enterWorkflowWorkspace。
   */
  get workflowPage(): WorkflowPage {
    if (!this._workflowPage) {
      throw new Error('workflow 页面尚未初始化');
    }
    return this._workflowPage;
  }

  /**
   * 统一暴露画布编辑页实例。
   */
  get editorPage(): WorkflowEditorPage {
    if (!this._editorPage) {
      throw new Error('workflow 画布页尚未初始化');
    }
    return this._editorPage;
  }

  /**
   * 统一暴露任务 API。
   */
  get taskApi(): TaskApi {
    if (!this._taskApi) {
      throw new Error('task api 尚未初始化');
    }
    return this._taskApi;
  }

  /**
   * 统一暴露计费 API。
   */
  get billingApi(): BillingApi {
    if (!this._billingApi) {
      throw new Error('billing api 尚未初始化');
    }
    return this._billingApi;
  }

  /**
   * 统一暴露资产 API。
   */
  get assetApi(): AssetApi {
    if (!this._assetApi) {
      throw new Error('asset api 尚未初始化');
    }
    return this._assetApi;
  }

  /**
   * 进入 workflow 模块，并初始化这一轮用例要复用的页面对象 / API 客户端。
   */
  async enterWorkflowWorkspace(): Promise<WorkflowPage> {
    await this.page.setViewportSize({ width: 1_800, height: 1_300 });
    await this.logger.capture('进入工作流模块前');
    this._workflowPage = await enterWorkflowPage(this.page);
    // API 客户端在进入模块后统一初始化，后续业务步骤直接复用，避免 spec 到处散着建上下文。
    this._taskApi = await TaskApi.create(this.page);
    this._billingApi = await BillingApi.create(this.page);
    this._assetApi = await AssetApi.create(this.page);
    await this.logger.capture('进入工作流模块后');
    return this.workflowPage;
  }

  /**
   * 创建一张空白画布，并切换到编辑页上下文。
   */
  async createBlankWorkflow(): Promise<{ canvasId: number }> {
    await this.logger.log('创建空白工作流');
    const canvasId = await this.workflowPage.createWorkflow();
    this._editorPage = new WorkflowEditorPage(this.page);
    await this.editorPage.waitForReady();
    await this.logger.capture(`已创建画布-${canvasId}`);
    return { canvasId };
  }

  /**
   * 批量删除名字包含关键字的工作流。
   */
  async deleteProjectsByKeyword(keyword: string, maxDeleteCount = 200): Promise<number> {
    await this.logger.log(`批量删除工作流，关键字: ${keyword}`);
    let deletedCount = 0;

    for (let attempt = 0; attempt < maxDeleteCount; attempt += 1) {
      const deleted = await this.workflowPage.deleteFirstProjectByKeyword(keyword).catch(async error => {
        await this.logger.attachText('工作流批量删除错误', String(error));
        throw error;
      });

      if (!deleted) {
        break;
      }

      deletedCount += 1;
      await this.logger.log(`已删除第 ${deletedCount} 个工作流`);
    }

    await this.logger.attachText(
      '工作流批量删除结果',
      `keyword=${keyword}, deletedCount=${deletedCount}`,
    );
    return deletedCount;
  }

  /**
   * 往画布里添加一个节点，并按传入参数完成节点配置。
   *
   * 返回值里会带上：
   * - cost：当前节点配置对应的赛点消耗
   * - nodeId：刚创建出来的节点 ID
   */
  async addNode(options: AddWorkflowNodeOptions): Promise<{
    cost: number;
    nodeId: string;
  }> {
    const canvasId = this.editorPage.getCanvasId();
    const beforeSnapshot = await this.taskApi.getCanvas(canvasId);
    const beforeCount = beforeSnapshot.data.nodes.filter(node => node.type === options.nodeType).length;

    await this.logger.log(`添加节点: ${options.nodeLabel}`);
    await this.editorPage.addNode(options.nodeLabel);
    const latestSnapshot = await this.taskApi.waitForNodeCount(
      canvasId,
      options.nodeType,
      beforeCount + 1,
    );

    await this.editorPage.closeUploadDialogIfOpen();
    // 新节点落到画布后，参数面板偶发会被上传弹窗或焦点丢失打断，先重新激活再配参数更稳。
    await this.reactivateNodePanel(options.nodeType, beforeCount, `选中节点并打开参数面板: ${options.nodeLabel}`);

    if (options.model) {
      await this.editorPage.closeUploadDialogIfOpen();
      await this.editorPage.nodePanel.selectModel(options.model);
    }
    if (options.resolution) {
      await this.editorPage.closeUploadDialogIfOpen();
      await this.editorPage.nodePanel.selectResolution(options.resolution);
    }
    if (options.aspectRatio) {
      await this.editorPage.closeUploadDialogIfOpen();
      await this.editorPage.nodePanel.selectAspectRatio(options.aspectRatio);
    }
    if (options.generationCount != null) {
      await this.editorPage.closeUploadDialogIfOpen();
      await this.editorPage.nodePanel.selectGenerationCount(options.generationCount);
    }
    if (options.prompt) {
      await this.reactivateNodePanel(
        options.nodeType,
        beforeCount,
        `填写提示词前重新激活节点面板: ${options.nodeLabel}`,
      );
      await this.editorPage.nodePanel.fillPrompt(options.prompt);
    }
    if (options.cameraControl) {
      await this.reactivateNodePanel(
        options.nodeType,
        beforeCount,
        `配置摄影参数前重新激活节点面板: ${options.nodeLabel}`,
      );
      await this.editorPage.closeUploadDialogIfOpen();
      await this.editorPage.nodePanel.configureCameraControl(options.cameraControl);
    }

    await this.reactivateNodePanel(
      options.nodeType,
      beforeCount,
      `参数配置后重新激活节点面板: ${options.nodeLabel}`,
    );

    const cost = await this.editorPage.nodePanel.readCost();
    const latestNode = latestSnapshot.data.nodes.filter(node => node.type === options.nodeType).at(-1);
    if (!latestNode) {
      throw new Error(`未找到刚添加的 ${options.nodeLabel} 节点`);
    }

    await this.logger.capture(`已添加节点-${options.nodeLabel}`);
    return {
      cost,
      nodeId: latestNode.id,
    };
  }

  /**
   * 执行当前选中的节点，并要求这次调用必须成功拿到 taskId。
   */
  async runSelectedNode(clickCount = 1): Promise<{
    invokeCount: number;
    taskId: number;
  }> {
    await this.editorPage.closeUploadDialogIfOpen();
    await this.logger.log(`执行选中节点，点击次数: ${clickCount}`);
    const result = await this.editorPage.nodePanel.runSelectedNode(clickCount);
    await this.logger.capture(`已触发执行-${result.taskId}`);
    return {
      invokeCount: result.invokeCount,
      taskId: result.taskId,
    };
  }

  /**
   * 尝试执行当前选中的节点。
   *
   * 和 runSelectedNode 的区别是：
   * - 这里允许“被拦截 / 没拿到 taskId”这种结果
   * - 适合余额不足、敏感内容等负向场景
   */
  async tryRunSelectedNode(
    clickCount = 1,
    responseTimeoutMs = 5_000,
  ): Promise<{
    accepted: boolean;
    invokeCount: number;
    taskId: number | null;
    message: string | null;
    payload: unknown;
  }> {
    await this.editorPage.closeUploadDialogIfOpen();
    await this.logger.log(`尝试执行选中节点，点击次数: ${clickCount}`);
    const result = await this.editorPage.nodePanel.tryRunSelectedNode(clickCount, responseTimeoutMs);
    await this.logger.capture(`尝试执行结果-${result.accepted ? result.taskId : 'blocked'}`);
    return {
      accepted: result.accepted,
      invokeCount: result.invokeCount,
      taskId: result.taskId,
      message: result.message,
      payload: result.payload,
    };
  }

  /**
   * 移动画布上的节点位置。
   */
  async moveNode(type: string, index: number, offsetX: number, offsetY: number): Promise<void> {
    await this.editorPage.dragNodeByOffset(type, index, offsetX, offsetY);
    await this.logger.capture(`已移动节点-${type}-${index}`);
  }

  /**
   * 连接两个节点。
   *
   * 优先走 UI 拖线；
   * 如果 UI 抽风没有真的建边，再回退到 API 自愈。
   */
  async connectNodes(options: {
    sourceType: string;
    sourceIndex?: number;
    targetType: string;
    targetIndex?: number;
    targetHandleIndex?: number;
    sourceHandle?: string;
    targetHandle?: string;
    edgeClassName?: string;
  }): Promise<void> {
    const canvasId = this.editorPage.getCanvasId();
    const beforeSnapshot = await this.taskApi.getCanvas(canvasId);
    const beforeEdgeCount = beforeSnapshot.data.edges.length;

    await this.editorPage.closeUploadDialogIfOpen();
    await this.editorPage.connectNodes(options);
    try {
      await this.taskApi.waitForEdgeCount(canvasId, beforeEdgeCount + 1, 8_000);
    } catch {
      // React Flow 拖线偶尔会掉事件，这里回退到 API 补边，避免整条链路被 UI 抽风拖死。
      const latestSnapshot = await this.taskApi.getCanvas(canvasId);
      const sourceNode = latestSnapshot.data.nodes.filter(node => node.type === options.sourceType)[
        options.sourceIndex ?? 0
      ];
      const targetNode = latestSnapshot.data.nodes.filter(node => node.type === options.targetType)[
        options.targetIndex ?? 0
      ];

      if (!sourceNode || !targetNode || !options.sourceHandle || !options.targetHandle) {
        throw new Error('UI 连线失败，且缺少自愈兜底所需的 edge 参数');
      }

      const edgeId = `xy-edge__${sourceNode.id}${options.sourceHandle}-${targetNode.id}${options.targetHandle}`;
      await this.taskApi.updateEdges(canvasId, [
        {
          id: edgeId,
          source: sourceNode.id,
          sourceHandle: options.sourceHandle,
          target: targetNode.id,
          targetHandle: options.targetHandle,
          className: options.edgeClassName ?? options.sourceHandle,
        },
      ]);
      await this.taskApi.waitForEdgeCount(canvasId, beforeEdgeCount + 1, 15_000);
    }
    await this.logger.capture('已完成节点连线');
  }

  /**
   * 刷新当前画布，并重建画布页对象。
   */
  async reloadCanvas(): Promise<void> {
    await this.page.reload();
    this._editorPage = new WorkflowEditorPage(this.page);
    await this.editorPage.waitForReady();
    await expect(this.page).toHaveURL(/\/canvas\/\d+/);
    await this.logger.capture('刷新画布后');
  }

  /**
   * 抓一份当前画布快照，并挂到测试证据里。
   */
  async captureCanvasSnapshot(
    label: string,
    canvasId = this.editorPage.getCanvasId(),
  ): Promise<CanvasSnapshot> {
    const snapshot = await this.taskApi.getCanvas(canvasId);
    await this.logger.attachJson(label, snapshot);
    return snapshot;
  }

  /**
   * 读取当前选中节点的模型文案。
   */
  async readSelectedModel(): Promise<string> {
    return this.editorPage.nodePanel.readModel();
  }

  /**
   * 读取当前选中节点的分辨率文案。
   */
  async readSelectedResolution(): Promise<string> {
    return this.editorPage.nodePanel.readResolution();
  }

  /**
   * 读取当前选中节点的宽高比文案。
   */
  async readSelectedAspectRatio(): Promise<string> {
    return this.editorPage.nodePanel.readAspectRatio();
  }

  /**
   * 读取当前选中节点的生成张数文案。
   */
  async readSelectedGenerationCount(): Promise<string> {
    return this.editorPage.nodePanel.readGenerationCount();
  }

  /**
   * 抓一份资产库快照。
   */
  async captureAssetLibrarySnapshot(assetType: AssetKind, pageSize = 15): Promise<AssetSnapshot> {
    return this.assetApi.captureSnapshot(assetType, pageSize);
  }

  /**
   * 从 UI 面板层确认指定资源 URL 已经出现在资产库里。
   */
  async expectAssetLibraryContainsUrls(
    assetType: AssetKind,
    urls: string[],
    timeoutMs = 20_000,
  ): Promise<void> {
    await this.editorPage.assetPanel.waitForAssetUrls(assetType, urls, timeoutMs);
  }

  /**
   * 断言摄影参数入口可见。
   */
  async expectCameraControlVisible(timeoutMs = 10_000): Promise<void> {
    await this.editorPage.nodePanel.expectCameraControlVisible(timeoutMs);
  }

  /**
   * 断言当前节点执行按钮处于锁定态。
   */
  async expectRunLocked(timeoutMs = 10_000): Promise<void> {
    await this.editorPage.nodePanel.expectRunLocked(timeoutMs);
  }

  /**
   * 等待余额不足弹窗出现。
   */
  async waitForInsufficientBalanceDialog(timeoutMs = 10_000): Promise<void> {
    await this.editorPage.nodePanel.waitForInsufficientBalanceDialog(timeoutMs);
  }

  /**
   * 读取余额不足弹窗文案。
   */
  async readInsufficientBalanceDialogText(): Promise<string> {
    return this.editorPage.nodePanel.readInsufficientBalanceDialogText();
  }

  /**
   * 读取敏感内容拦截提示文案。
   */
  async readSensitiveContentHint(): Promise<string> {
    return this.editorPage.nodePanel.readSensitiveContentHint();
  }

  /**
   * 断言画布上的某个节点当前可见。
   */
  async expectNodeVisible(type: string, index = 0): Promise<void> {
    await expect(this.editorPage.nodeByType(type, index)).toBeVisible();
  }

  /**
   * 释放这一轮用例创建的 API 资源。
   */
  async dispose(): Promise<void> {
    await Promise.all([
      this._taskApi?.dispose(),
      this._billingApi?.dispose(),
      this._assetApi?.dispose(),
    ]);
  }

  private async reactivateNodePanel(
    nodeType: string,
    nodeIndex: number,
    label: string,
  ): Promise<void> {
    await withRetry(
      label,
      async () => {
        // 某些参数操作后右侧面板会短暂失焦，重新点中节点比盲等更可靠。
        if (!(await this.editorPage.nodePanel.isPanelReady())) {
          await this.editorPage.selectNode(nodeType, nodeIndex);
        }
        await this.editorPage.closeUploadDialogIfOpen();
        await this.editorPage.nodePanel.waitForPanelReady(10_000);
      },
      { retries: 2 },
    );
  }
}
