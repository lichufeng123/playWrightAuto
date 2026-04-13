import {
  AssetRecord,
  AssetSnapshot,
} from '../api/asset.api';
import {
  AccountBalance,
  AccountFlowRecord,
  getBalanceTotal,
  sumFlowPoints,
} from '../api/billing.api';
import {
  CanvasSnapshot,
  WorkflowNode,
  getNodeProductCount,
  getNodeTaskStatus,
  hasNodeOutput,
} from '../api/task.api';

function summarizeBalance(balance?: AccountBalance): {
  rechargeBalance: number;
  giftBalance: number;
  totalBalance: number;
} | null {
  if (!balance) {
    return null;
  }

  return {
    rechargeBalance: balance.rechargeBalance,
    giftBalance: balance.giftBalance,
    totalBalance: getBalanceTotal(balance),
  };
}

export function buildWorkflowRunEvidence(options: {
  caseName: string;
  canvasId: number;
  nodeId: string;
  nodeType: string;
  taskId: number | null;
  invokeCount: number;
  cost: number;
  balanceBefore?: AccountBalance;
  balanceAfter?: AccountBalance;
  flowRecords?: AccountFlowRecord[];
  terminalNode?: WorkflowNode;
  canvasSnapshot?: CanvasSnapshot;
  assetSnapshotBefore?: AssetSnapshot;
  assetSnapshotAfter?: AssetSnapshot;
  matchedAssets?: AssetRecord[];
}) {
  const balanceBefore = summarizeBalance(options.balanceBefore);
  const balanceAfter = summarizeBalance(options.balanceAfter);

  return {
    caseName: options.caseName,
    canvasId: options.canvasId,
    nodeId: options.nodeId,
    nodeType: options.nodeType,
    taskId: options.taskId,
    invokeCount: options.invokeCount,
    cost: options.cost,
    balanceBefore,
    balanceAfter,
    balanceDelta:
      balanceBefore && balanceAfter
        ? balanceAfter.totalBalance - balanceBefore.totalBalance
        : null,
    flowRecordCount: options.flowRecords?.length ?? 0,
    flowPointsTotal: options.flowRecords ? sumFlowPoints(options.flowRecords) : 0,
    flowRecords: options.flowRecords ?? [],
    terminalNode: options.terminalNode
      ? {
          status: getNodeTaskStatus(options.terminalNode),
          taskId: options.terminalNode.data.taskInfo?.taskId ?? null,
          errorMsg: options.terminalNode.data.taskInfo?.errorMsg ?? null,
          productCount: getNodeProductCount(options.terminalNode),
          hasOutput: hasNodeOutput(options.terminalNode),
        }
      : null,
    canvas: options.canvasSnapshot
      ? {
          taskStatus: options.canvasSnapshot.taskStatus,
          nodeCount: options.canvasSnapshot.data.nodes.length,
          edgeCount: options.canvasSnapshot.data.edges.length,
        }
      : null,
    assetLibrary: options.assetSnapshotAfter
      ? {
          assetType: options.assetSnapshotAfter.assetType,
          totalBefore: options.assetSnapshotBefore?.total ?? null,
          totalAfter: options.assetSnapshotAfter.total,
          matchedAssetCount: options.matchedAssets?.length ?? 0,
          matchedAssets:
            options.matchedAssets?.map(asset => ({
              id: asset.id,
              fileUrl: asset.fileUrl,
              coverUrl: asset.coverUrl,
              createTime: asset.createTime,
              sourceType: asset.sourceType ?? null,
              canvasId: asset.canvasId ?? null,
            })) ?? [],
        }
      : null,
  };
}

export function buildCanvasConsistencyEvidence(options: {
  caseName: string;
  canvasId: number;
  beforeReload: CanvasSnapshot;
  afterReload: CanvasSnapshot;
}) {
  return {
    caseName: options.caseName,
    canvasId: options.canvasId,
    beforeReload: {
      taskStatus: options.beforeReload.taskStatus,
      nodeCount: options.beforeReload.data.nodes.length,
      edgeCount: options.beforeReload.data.edges.length,
      nodeTypes: options.beforeReload.data.nodes.map(node => node.type),
    },
    afterReload: {
      taskStatus: options.afterReload.taskStatus,
      nodeCount: options.afterReload.data.nodes.length,
      edgeCount: options.afterReload.data.edges.length,
      nodeTypes: options.afterReload.data.nodes.map(node => node.type),
    },
  };
}
