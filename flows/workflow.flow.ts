import { expect, Page, TestInfo } from '@playwright/test';
import { BillingApi } from '../api/billing.api';
import { CanvasSnapshot, TaskApi } from '../api/task.api';
import { CameraControlOptions } from '../pages/node.panel.page';
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

export class WorkflowFlow {
  private _workflowPage: WorkflowPage | null = null;
  private _taskApi: TaskApi | null = null;
  private _billingApi: BillingApi | null = null;
  readonly logger: StepLogger;

  constructor(
    private readonly page: Page,
    testInfo?: TestInfo,
  ) {
    this.logger = new StepLogger(page, testInfo, 'workflow');
  }

  get workflowPage(): WorkflowPage {
    if (!this._workflowPage) {
      throw new Error('workflow 页面尚未初始化');
    }
    return this._workflowPage;
  }

  get taskApi(): TaskApi {
    if (!this._taskApi) {
      throw new Error('task api 尚未初始化');
    }
    return this._taskApi;
  }

  get billingApi(): BillingApi {
    if (!this._billingApi) {
      throw new Error('billing api 尚未初始化');
    }
    return this._billingApi;
  }

  async enterWorkflowWorkspace(): Promise<WorkflowPage> {
    await this.page.setViewportSize({ width: 1_800, height: 1_300 });
    await this.logger.capture('进入工作流模块前');
    this._workflowPage = await enterWorkflowPage(this.page);
    this._taskApi = await TaskApi.create(this.page);
    this._billingApi = await BillingApi.create(this.page);
    await this.logger.capture('进入工作流模块后');
    return this.workflowPage;
  }

  async createBlankWorkflow(): Promise<{ canvasId: number }> {
    await this.logger.log('创建空白工作流');
    const canvasId = await this.workflowPage.createWorkflow();
    await this.logger.capture(`已创建画布-${canvasId}`);
    return { canvasId };
  }

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

  async addNode(options: AddWorkflowNodeOptions): Promise<{
    cost: number;
    nodeId: string;
  }> {
    const canvasId = this.workflowPage.getCanvasId();
    const beforeSnapshot = await this.taskApi.getCanvas(canvasId);
    const beforeCount = beforeSnapshot.data.nodes.filter(node => node.type === options.nodeType).length;

    await this.logger.log(`添加节点: ${options.nodeLabel}`);
    await this.workflowPage.drawer.addNode(options.nodeLabel);
    const latestSnapshot = await this.taskApi.waitForNodeCount(
      canvasId,
      options.nodeType,
      beforeCount + 1,
    );

    await this.workflowPage.canvas.closeUploadDialogIfOpen();
    await withRetry(
      `选中节点并打开参数面板: ${options.nodeLabel}`,
      async () => {
        if (!(await this.workflowPage.nodePanel.isPanelReady())) {
          await this.workflowPage.canvas.selectNode(options.nodeType, beforeCount);
        }
        await this.workflowPage.canvas.closeUploadDialogIfOpen();
        await this.workflowPage.nodePanel.waitForPanelReady(10_000);
      },
      { retries: 2 },
    );
    if (options.model) {
      await this.workflowPage.canvas.closeUploadDialogIfOpen();
      await this.workflowPage.nodePanel.selectModel(options.model);
    }
    if (options.resolution) {
      await this.workflowPage.canvas.closeUploadDialogIfOpen();
      await this.workflowPage.nodePanel.selectResolution(options.resolution);
    }
    if (options.aspectRatio) {
      await this.workflowPage.canvas.closeUploadDialogIfOpen();
      await this.workflowPage.nodePanel.selectAspectRatio(options.aspectRatio);
    }
    if (options.generationCount != null) {
      await this.workflowPage.canvas.closeUploadDialogIfOpen();
      await this.workflowPage.nodePanel.selectGenerationCount(options.generationCount);
    }
    if (options.prompt) {
      await this.workflowPage.nodePanel.fillPrompt(options.prompt);
    }
    if (options.cameraControl) {
      await this.workflowPage.canvas.closeUploadDialogIfOpen();
      await this.workflowPage.nodePanel.configureCameraControl(options.cameraControl);
    }

    await withRetry(
      `摄影参数配置后重新激活节点面板: ${options.nodeLabel}`,
      async () => {
        if (!(await this.workflowPage.nodePanel.isPanelReady())) {
          await this.workflowPage.canvas.selectNode(options.nodeType, beforeCount);
        }
        await this.workflowPage.canvas.closeUploadDialogIfOpen();
        await this.workflowPage.nodePanel.waitForPanelReady(10_000);
      },
      { retries: 2 },
    );

    const cost = await this.workflowPage.nodePanel.readCost();
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

  async runSelectedNode(clickCount = 1): Promise<{
    invokeCount: number;
    taskId: number;
  }> {
    await this.workflowPage.canvas.closeUploadDialogIfOpen();
    await this.logger.log(`执行选中节点，点击次数: ${clickCount}`);
    const result = await this.workflowPage.nodePanel.runSelectedNode(clickCount);
    await this.logger.capture(`已触发执行-${result.taskId}`);
    return {
      invokeCount: result.invokeCount,
      taskId: result.taskId,
    };
  }

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
    await this.workflowPage.canvas.closeUploadDialogIfOpen();
    await this.logger.log(`尝试执行选中节点，点击次数: ${clickCount}`);
    const result = await this.workflowPage.nodePanel.tryRunSelectedNode(clickCount, responseTimeoutMs);
    await this.logger.capture(`尝试执行结果-${result.accepted ? result.taskId : 'blocked'}`);
    return {
      accepted: result.accepted,
      invokeCount: result.invokeCount,
      taskId: result.taskId,
      message: result.message,
      payload: result.payload,
    };
  }

  async moveNode(type: string, index: number, offsetX: number, offsetY: number): Promise<void> {
    await this.workflowPage.canvas.dragNodeByOffset(type, index, offsetX, offsetY);
    await this.logger.capture(`已移动节点-${type}-${index}`);
  }

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
    const canvasId = this.workflowPage.getCanvasId();
    const beforeSnapshot = await this.taskApi.getCanvas(canvasId);
    const beforeEdgeCount = beforeSnapshot.data.edges.length;

    await this.workflowPage.canvas.closeUploadDialogIfOpen();
    await this.workflowPage.canvas.connectNodes(options);
    try {
      await this.taskApi.waitForEdgeCount(canvasId, beforeEdgeCount + 1, 8_000);
    } catch {
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

  async reloadCanvas(): Promise<void> {
    await this.page.reload();
    await this.workflowPage.canvas.waitForReady();
    await expect(this.page).toHaveURL(/\/canvas\/\d+/);
    await this.logger.capture('刷新画布后');
  }

  async captureCanvasSnapshot(
    label: string,
    canvasId = this.workflowPage.getCanvasId(),
  ): Promise<CanvasSnapshot> {
    const snapshot = await this.taskApi.getCanvas(canvasId);
    await this.logger.attachJson(label, snapshot);
    return snapshot;
  }

  async dispose(): Promise<void> {
    await Promise.all([
      this._taskApi?.dispose(),
      this._billingApi?.dispose(),
    ]);
  }
}
