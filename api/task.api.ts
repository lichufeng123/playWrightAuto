import { APIRequestContext, Page } from '@playwright/test';
import { createAuthedApiContext } from './client';
import { assertConditionRemains, pollUntil } from '../utils/polling';

export interface WorkflowTaskInfo {
  status?: string;
  taskId?: string;
  errorMsg?: string;
  progress?: string | number;
}

export interface WorkflowNodeData {
  title?: string;
  value?: string;
  params?: Record<string, unknown>;
  product?: unknown[];
  taskInfo?: WorkflowTaskInfo;
  tempFile?: unknown;
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: WorkflowNodeData;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  className?: string;
}

export interface CanvasSnapshot {
  id: number;
  name: string;
  taskStatus: string;
  data: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  raw: unknown;
}

const terminalNodeStatuses = [
  'success',
  'failed',
  'fail',
  'failure',
  'error',
  'cancel',
  'canceled',
  'cancelled',
];

function normalizeTaskStatus(status?: string): string {
  return (status ?? '').toLowerCase();
}

export function getNodeTaskStatus(node: WorkflowNode): string {
  return normalizeTaskStatus(node.data.taskInfo?.status);
}

export function getNodeProductCount(node: WorkflowNode): number {
  return Array.isArray(node.data.product) ? node.data.product.length : 0;
}

export function hasNodeOutput(node: WorkflowNode): boolean {
  return Boolean(node.data.value) || Boolean(node.data.tempFile) || getNodeProductCount(node) > 0;
}

export function findNodeById(
  snapshot: CanvasSnapshot,
  nodeId: string,
): WorkflowNode | undefined {
  return snapshot.data.nodes.find(node => node.id === nodeId);
}

export class TaskApi {
  private constructor(
    private readonly requestContext: APIRequestContext,
    private readonly gatewayOrigin: string,
  ) {}

  static async create(page: Page): Promise<TaskApi> {
    const { context, gatewayOrigin } = await createAuthedApiContext(page);
    return new TaskApi(context, gatewayOrigin);
  }

  private buildUrl(path: string): string {
    return `${this.gatewayOrigin}${path}`;
  }

  async getCanvas(canvasId: number | string): Promise<CanvasSnapshot> {
    const response = await this.requestContext.post(
      this.buildUrl('/game-ai-editor-center/api/canvas/get'),
      {
        data: { id: String(canvasId) },
      },
    );

    if (!response.ok()) {
      throw new Error(`获取画布失败: ${response.status()}`);
    }

    const payload = await response.json();
    const rawData = payload.data ?? {};
    const graph = rawData.data ? JSON.parse(rawData.data) : { nodes: [], edges: [] };

    return {
      id: rawData.id,
      name: rawData.name,
      taskStatus: rawData.taskStatus,
      data: {
        nodes: (graph.nodes ?? []) as WorkflowNode[],
        edges: (graph.edges ?? []) as WorkflowEdge[],
      },
      raw: payload,
    };
  }

  async waitForNodeCount(
    canvasId: number | string,
    nodeType: string,
    expectedCount: number,
    timeoutMs = 30_000,
  ): Promise<CanvasSnapshot> {
    return pollUntil(
      () => this.getCanvas(canvasId),
      snapshot => snapshot.data.nodes.filter(node => node.type === nodeType).length >= expectedCount,
      {
        timeoutMs,
        intervalMs: 1_500,
        description: `等待 ${nodeType} 节点数量达到 ${expectedCount}`,
      },
    );
  }

  async waitForEdgeCount(
    canvasId: number | string,
    expectedCount: number,
    timeoutMs = 30_000,
  ): Promise<CanvasSnapshot> {
    return pollUntil(
      () => this.getCanvas(canvasId),
      snapshot => snapshot.data.edges.length >= expectedCount,
      {
        timeoutMs,
        intervalMs: 1_500,
        description: `等待连线数量达到 ${expectedCount}`,
      },
    );
  }

  async waitForNodeStatus(
    canvasId: number | string,
    nodeId: string,
    expectedStatus: string | string[],
    timeoutMs = 120_000,
  ): Promise<WorkflowNode> {
    const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    const snapshot = await pollUntil(
      () => this.getCanvas(canvasId),
      canvas => {
        const targetNode = canvas.data.nodes.find(node => node.id === nodeId);
        return Boolean(targetNode && statuses.includes(targetNode.data.taskInfo?.status ?? ''));
      },
      {
        timeoutMs,
        intervalMs: 2_000,
        description: `等待节点 ${nodeId} 状态变为 ${statuses.join('/')}`,
      },
    );

    const targetNode = snapshot.data.nodes.find(node => node.id === nodeId);
    if (!targetNode) {
      throw new Error(`未找到节点 ${nodeId}`);
    }

    return targetNode;
  }

  async getNode(
    canvasId: number | string,
    nodeId: string,
  ): Promise<WorkflowNode> {
    const snapshot = await this.getCanvas(canvasId);
    const targetNode = findNodeById(snapshot, nodeId);
    if (!targetNode) {
      throw new Error(`未找到节点 ${nodeId}`);
    }
    return targetNode;
  }

  async waitForNodeTaskId(
    canvasId: number | string,
    nodeId: string,
    taskId: number | string,
    timeoutMs = 60_000,
  ): Promise<WorkflowNode> {
    const expectedTaskId = String(taskId);
    return this.waitForNodePredicate(
      canvasId,
      nodeId,
      node => (node.data.taskInfo?.taskId ?? '') === expectedTaskId,
      timeoutMs,
      `等待节点 ${nodeId} 绑定任务 ${expectedTaskId}`,
    );
  }

  async waitForNodeTerminalStatus(
    canvasId: number | string,
    nodeId: string,
    timeoutMs = 180_000,
  ): Promise<WorkflowNode> {
    return this.waitForNodePredicate(
      canvasId,
      nodeId,
      node => terminalNodeStatuses.includes(getNodeTaskStatus(node)),
      timeoutMs,
      `等待节点 ${nodeId} 进入终态`,
    );
  }

  async assertNodeTaskNotStarted(
    canvasId: number | string,
    nodeId: string,
    observeMs = 5_000,
  ): Promise<WorkflowNode> {
    return assertConditionRemains(
      () => this.getNode(canvasId, nodeId),
      node => {
        const status = getNodeTaskStatus(node);
        return !node.data.taskInfo?.taskId && status !== 'running' && !terminalNodeStatuses.includes(status);
      },
      {
        timeoutMs: observeMs,
        intervalMs: 1_000,
        description: `节点 ${nodeId} 已开始执行，未命中余额不足拦截`,
      },
    );
  }

  private async waitForNodePredicate(
    canvasId: number | string,
    nodeId: string,
    predicate: (node: WorkflowNode) => boolean | Promise<boolean>,
    timeoutMs: number,
    description: string,
  ): Promise<WorkflowNode> {
    const snapshot = await pollUntil(
      () => this.getCanvas(canvasId),
      async canvas => {
        const targetNode = findNodeById(canvas, nodeId);
        return Boolean(targetNode && (await predicate(targetNode)));
      },
      {
        timeoutMs,
        intervalMs: 2_000,
        description,
      },
    );

    const targetNode = findNodeById(snapshot, nodeId);
    if (!targetNode) {
      throw new Error(`未找到节点 ${nodeId}`);
    }

    return targetNode;
  }

  async updateEdges(
    canvasId: number | string,
    edges: WorkflowEdge[],
  ): Promise<void> {
    const response = await this.requestContext.post(
      this.buildUrl('/game-ai-editor-center/api/canvas/partialUpdate'),
      {
        data: {
          id: String(canvasId),
          updateNodes: [],
          addNodes: [],
          deleteNodeIds: [],
          edges,
        },
      },
    );

    if (!response.ok()) {
      throw new Error(`更新连线失败: ${response.status()}`);
    }
  }

  async dispose(): Promise<void> {
    await this.requestContext.dispose();
  }
}
