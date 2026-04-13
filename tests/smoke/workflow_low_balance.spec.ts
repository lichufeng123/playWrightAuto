import { expect, test } from '@playwright/test';
import { AssetFlow } from '../../flows/asset.flow';
import { hasNodeOutput } from '../../api/task.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowBillingCases, workflowTimeouts } from '../data/workflow.data';
import { buildWorkflowRunEvidence } from '../../utils/report';

const LOW_BALANCE_USER = 'lowBalanceUser';

test.describe('工作流低余额拦截', () => {
  test.describe.configure({ mode: 'serial' });

  test('计费：余额不足时拦截执行且不产生消费', async ({ page }, testInfo) => {
    test.skip(
      (process.env.PW_USER ?? '') !== LOW_BALANCE_USER,
      `该用例需要使用 ${LOW_BALANCE_USER} 运行`,
    );
    test.setTimeout(workflowTimeouts.smokeMs);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      const { canvasId } = await workflowFlow.createBlankWorkflow();

      const billingFlow = new BillingFlow(workflowFlow.billingApi);
      const billingSnapshotBefore = await billingFlow.captureSnapshot();
      const assetFlow = new AssetFlow(workflowFlow.assetApi);
      const assetSnapshotBefore = await assetFlow.captureSnapshot('image');
      const node = await workflowFlow.addNode(workflowBillingCases.imageSingleInvokePreDeduct);

      expect(
        billingSnapshotBefore.balance.giftBalance + billingSnapshotBefore.balance.rechargeBalance,
      ).toBeLessThan(node.cost);

      const attempt = await workflowFlow.tryRunSelectedNode(1, 4_000);
      expect(attempt.accepted).toBeFalsy();
      expect(attempt.invokeCount).toBeLessThanOrEqual(1);
      expect(attempt.taskId).toBeNull();
      expect(`${attempt.message ?? ''}${JSON.stringify(attempt.payload ?? {})}`).toMatch(
        /余额不足|赛点不足|余额不够|赛点不够/,
      );

      await workflowFlow.waitForInsufficientBalanceDialog(8_000);
      const dialogText = await workflowFlow.readInsufficientBalanceDialogText();
      expect(dialogText).toMatch(/余额为40赛点|余额不足|请先充值/);

      const balanceAfter = await billingFlow.assertBalanceUnchanged(
        billingSnapshotBefore.balance,
        5_000,
      );
      const newFlowRecords = await billingFlow.assertNoNewFlowRecordsSince(
        billingSnapshotBefore,
        5_000,
      );
      const blockedNode = await workflowFlow.taskApi.getNode(canvasId, node.nodeId);
      expect(blockedNode.data.taskInfo?.taskId ?? '').toBe('');
      expect(hasNodeOutput(blockedNode)).toBeFalsy();
      const assetResult = await assetFlow.assertNoNewAssetsSince(
        assetSnapshotBefore,
        record => record.sourceType === 'workflow' && record.canvasId === canvasId,
        8_000,
      );
      expect(assetResult.matchedAssets).toHaveLength(0);

      const canvasSnapshot = await workflowFlow.captureCanvasSnapshot('低余额拦截-画布快照', canvasId);
      await workflowFlow.logger.attachJson(
        '低余额拦截-证据',
        buildWorkflowRunEvidence({
          caseName: '计费：余额不足时拦截执行且不产生消费',
          canvasId,
          nodeId: node.nodeId,
          nodeType: workflowBillingCases.imageSingleInvokePreDeduct.nodeType,
          taskId: attempt.taskId,
          invokeCount: attempt.invokeCount,
          cost: node.cost,
          balanceBefore: billingSnapshotBefore.balance,
          balanceAfter,
          flowRecords: newFlowRecords,
          terminalNode: blockedNode,
          canvasSnapshot,
          assetSnapshotBefore,
          assetSnapshotAfter: assetResult.snapshot,
          matchedAssets: assetResult.matchedAssets,
        }),
      );
      await workflowFlow.logger.attachJson('低余额拦截-响应详情', {
        accepted: attempt.accepted,
        invokeCount: attempt.invokeCount,
        taskId: attempt.taskId,
        message: attempt.message,
        payload: attempt.payload,
      });
      await workflowFlow.logger.attachText('低余额拦截-弹窗文案', dialogText);
    } finally {
      await workflowFlow.dispose();
    }
  });
});
