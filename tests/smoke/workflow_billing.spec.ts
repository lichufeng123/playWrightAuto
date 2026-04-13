import { expect, test } from '@playwright/test';
import { resolveAssetKindByNodeType } from '../../api/asset.api';
import { getBalanceTotal } from '../../api/billing.api';
import { getNodeTaskStatus } from '../../api/task.api';
import { AssetFlow } from '../../flows/asset.flow';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowBillingCases, workflowTimeouts } from '../data/workflow.data';
import { buildWorkflowRunEvidence } from '../../utils/report';

test.describe('工作流计费', () => {
  test.describe.configure({ mode: 'serial' });

  for (const billingCase of Object.values(workflowBillingCases)) {
    test(billingCase.caseName, async ({ page }, testInfo) => {
      // 设置测试超时时间，确保在等待计费相关的异步事件时不会过早超时
      test.setTimeout(workflowTimeouts.smokeMs);

      const workflowFlow = new WorkflowFlow(page, testInfo);

      try {
        await workflowFlow.enterWorkflowWorkspace();
        const { canvasId } = await workflowFlow.createBlankWorkflow();

        const billingFlow = new BillingFlow(workflowFlow.billingApi);
        const billingSnapshotBefore = await billingFlow.captureSnapshot();
        const assetType = resolveAssetKindByNodeType(billingCase.nodeType);
        expect(assetType).toBeTruthy();
        const assetFlow = new AssetFlow(workflowFlow.assetApi);
        const assetSnapshotBefore = await assetFlow.captureSnapshot(assetType!);

        const node = await workflowFlow.addNode(billingCase);
        const invoke = await workflowFlow.runSelectedNode(billingCase.clickCount);

        expect(invoke.invokeCount).toBe(billingCase.expectedInvokeCount);
        expect(invoke.taskId).toBeGreaterThan(0);

        if (billingCase.expectRunLockedDuringExecution) {
          await workflowFlow.expectRunLocked();
        }

        const acceptedNode = await workflowFlow.taskApi.waitForNodeTaskId(
          canvasId,
          node.nodeId,
          invoke.taskId,
          workflowTimeouts.billingMs,
        );
        expect(acceptedNode.data.taskInfo?.taskId).toBe(String(invoke.taskId));

        const successNode = await workflowFlow.taskApi.waitForNodeTerminalStatus(
          canvasId,
          node.nodeId,
          workflowTimeouts.nodeExecutionMs,
        );
        expect(getNodeTaskStatus(successNode)).toBe('success');

        const productUrls = Array.isArray(successNode.data.product)
          ? successNode.data.product
              .map(product => {
                if (
                  product &&
                  typeof product === 'object' &&
                  'value' in product &&
                  typeof (product as { value?: unknown }).value === 'string'
                ) {
                  return (product as { value: string }).value;
                }
                return '';
              })
              .filter(Boolean)
          : [];
        expect(productUrls.length).toBeGreaterThan(0);

        const assetResult = await assetFlow.waitForNewAssetsSince(
          assetSnapshotBefore,
          record => record.canvasId === canvasId && productUrls.includes(record.fileUrl),
          {
            timeoutMs: workflowTimeouts.assetMs,
            minCount: productUrls.length,
            pageSize: Math.max(15, productUrls.length + 5),
          },
        );
        expect(assetResult.matchedAssets).toHaveLength(productUrls.length);
        await workflowFlow.expectAssetLibraryContainsUrls(assetType!, productUrls, workflowTimeouts.assetMs);

        const balanceAfter = await billingFlow.waitForBalanceDelta(
          billingSnapshotBefore.balance,
          -node.cost,
          workflowTimeouts.billingMs,
        );
        expect(getBalanceTotal(balanceAfter)).toBe(
          getBalanceTotal(billingSnapshotBefore.balance) - node.cost,
        );

        const newFlowRecords = await billingFlow.waitForFlowRecordsSince(
          billingSnapshotBefore,
          record =>
            record.flowName === 'WORKFLOW' &&
            record.flowPoints === -node.cost &&
            (record.remark ?? '').includes(billingCase.expectedRemark),
          {
            timeoutMs: workflowTimeouts.billingMs,
            minCount: billingCase.expectedNewFlowRecordCount ?? 1,
          },
        );
        expect(newFlowRecords).toHaveLength(billingCase.expectedNewFlowRecordCount ?? 1);

        const latestFlowRecord = newFlowRecords[0];
        expect(latestFlowRecord.flowType).toBe('FUNCTION_USAGE');
        expect(latestFlowRecord.remark ?? '').toContain(billingCase.expectedRemark);

        const canvasSnapshot = await workflowFlow.captureCanvasSnapshot(
          `计费-${billingCase.caseName}-画布快照`,
          canvasId,
        );
        await workflowFlow.logger.attachJson(
          `计费-${billingCase.caseName}-证据`,
          buildWorkflowRunEvidence({
            caseName: billingCase.caseName,
            canvasId,
            nodeId: node.nodeId,
            nodeType: billingCase.nodeType,
            taskId: invoke.taskId,
            invokeCount: invoke.invokeCount,
            cost: node.cost,
            balanceBefore: billingSnapshotBefore.balance,
            balanceAfter,
            flowRecords: newFlowRecords,
            terminalNode: successNode,
            canvasSnapshot,
            assetSnapshotBefore,
            assetSnapshotAfter: assetResult.snapshot,
            matchedAssets: assetResult.matchedAssets,
          }),
        );
      } finally {
        await workflowFlow.dispose();
      }
    });
  }
});
