import { APIRequestContext, Page } from '@playwright/test';
import { createAuthedApiContext } from './client';
import { pollUntil } from '../utils/polling';

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
