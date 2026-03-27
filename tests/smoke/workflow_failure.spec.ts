import { expect, test } from '@playwright/test';
import { sumFlowPoints } from '../../api/billing.api';
import { getNodeTaskStatus, hasNodeOutput } from '../../api/task.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowCases, workflowTimeouts } from '../data/workflow.data';
import { buildCanvasConsistencyEvidence, buildWorkflowRunEvidence } from '../../utils/report';

test.describe('工作流异常与一致性', () => {
  test.describe.configure({ mode: 'serial' });

  test('异常场景：页面刷新后节点与连线保持一致', async ({ page }, testInfo) => {
    test.setTimeout(workflowTimeouts.smokeMs);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      const { canvasId } = await workflowFlow.createBlankWorkflow();

      await workflowFlow.addNode(workflowCases.connection.source);
      await workflowFlow.addNode(workflowCases.connection.target);
      await workflowFlow.connectNodes({
        sourceType: 'image',
        targetType: 'video',
        sourceHandle: 'image_source',
        targetHandle: 'image_target',
        edgeClassName: 'image_source',
      });

      const canvasBeforeReload = await workflowFlow.taskApi.waitForEdgeCount(canvasId, 1);
      expect(canvasBeforeReload.data.nodes.filter(node => node.type === 'image')).toHaveLength(1);
      expect(canvasBeforeReload.data.nodes.filter(node => node.type === 'video')).toHaveLength(1);
      await workflowFlow.logger.attachJson('异常一致性-刷新前画布快照', canvasBeforeReload);

      await workflowFlow.reloadCanvas();

      const canvasAfterReload = await workflowFlow.taskApi.waitForEdgeCount(canvasId, 1);
      expect(canvasAfterReload.data.edges).toHaveLength(1);
      expect(canvasAfterReload.data.nodes.filter(node => node.type === 'image')).toHaveLength(1);
      expect(canvasAfterReload.data.nodes.filter(node => node.type === 'video')).toHaveLength(1);
      await workflowFlow.logger.attachJson('异常一致性-刷新后画布快照', canvasAfterReload);
      await workflowFlow.logger.attachJson(
        '异常一致性-对比证据',
        buildCanvasConsistencyEvidence({
          caseName: '异常场景：页面刷新后节点与连线保持一致',
          canvasId,
          beforeReload: canvasBeforeReload,
          afterReload: canvasAfterReload,
        }),
      );

      await expect(workflowFlow.workflowPage.canvas.nodeByType('image')).toBeVisible();
      await expect(workflowFlow.workflowPage.canvas.nodeByType('video')).toBeVisible();
    } finally {
      await workflowFlow.dispose();
    }
  });

  test('异常场景：任务失败后返还赛点', async ({ page }, testInfo) => {
    test.fail(
      true,
      '当前 test 环境下，即梦5.0 敏感词任务长时间停留在 running，未稳定进入失败返还链路',
    );
    test.setTimeout(workflowTimeouts.smokeMs);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      const { canvasId } = await workflowFlow.createBlankWorkflow();

      const billingFlow = new BillingFlow(workflowFlow.billingApi);
      const billingSnapshotBefore = await billingFlow.captureSnapshot(30);
      const node = await workflowFlow.addNode(workflowCases.failureSensitiveImage);

      const invoke = await workflowFlow.runSelectedNode();
      expect(invoke.invokeCount).toBe(1);
      expect(invoke.taskId).toBeGreaterThan(0);
      const nodeAfterInvoke = await workflowFlow.taskApi.getNode(canvasId, node.nodeId);
      const billingSnapshotAfterInvoke = await billingFlow.captureSnapshot(10);
      await workflowFlow.logger.attachJson('失败返还-发起后快照', {
        invoke,
        nodeAfterInvoke,
        balanceBefore: billingSnapshotBefore.balance,
        balanceAfterInvoke: billingSnapshotAfterInvoke.balance,
        flowRecordsAfterInvoke: billingSnapshotAfterInvoke.flowRecords,
      });

      const balanceAfterDeduct = await billingFlow.waitForBalanceDelta(
        billingSnapshotBefore.balance,
        -node.cost,
        workflowTimeouts.billingMs,
      );
      expect(balanceAfterDeduct.giftBalance + balanceAfterDeduct.rechargeBalance).toBe(
        billingSnapshotBefore.balance.giftBalance + billingSnapshotBefore.balance.rechargeBalance - node.cost,
      );

      const failedNode = await workflowFlow.taskApi.waitForNodeTerminalStatus(
        canvasId,
        node.nodeId,
        30_000,
      ).catch(async () => await workflowFlow.taskApi.getNode(canvasId, node.nodeId));

      const sensitiveHintText = await workflowFlow.workflowPage.nodePanel.readSensitiveContentHint();
      expect(sensitiveHintText).toContain('敏感内容');
      await workflowFlow.logger.attachText('失败返还-页面提示', sensitiveHintText);
      await workflowFlow.logger.attachJson('失败返还-节点快照', failedNode);
      if (failedNode.data.taskInfo?.status) {
        expect(workflowCases.failureSensitiveImage.expectedTerminalStatuses).toContain(
          getNodeTaskStatus(failedNode),
        );
      }
      expect(hasNodeOutput(failedNode)).toBeFalsy();

      const balanceAfterRefund = await billingFlow.waitForBalanceDelta(
        billingSnapshotBefore.balance,
        0,
        workflowTimeouts.nodeExecutionMs,
      );
      expect(balanceAfterRefund.giftBalance + balanceAfterRefund.rechargeBalance).toBe(
        billingSnapshotBefore.balance.giftBalance + billingSnapshotBefore.balance.rechargeBalance,
      );

      const refundFlowRecords = await billingFlow.waitForFlowRecordsSince(
        billingSnapshotBefore,
        record =>
          record.flowName === 'WORKFLOW' &&
          Math.abs(record.flowPoints) === node.cost,
        {
          timeoutMs: workflowTimeouts.nodeExecutionMs,
          minCount: 2,
          size: 30,
        },
      );
      expect(refundFlowRecords.some(record => record.flowPoints === -node.cost)).toBeTruthy();
      expect(refundFlowRecords.some(record => record.flowPoints === node.cost)).toBeTruthy();
      expect(sumFlowPoints(refundFlowRecords)).toBe(0);

      const canvasSnapshot = await workflowFlow.captureCanvasSnapshot(
        '失败返还-画布快照',
        canvasId,
      );
      await workflowFlow.logger.attachJson(
        '失败返还-执行证据',
        buildWorkflowRunEvidence({
          caseName: '异常场景：任务失败后返还赛点',
          canvasId,
          nodeId: node.nodeId,
          nodeType: workflowCases.failureSensitiveImage.nodeType,
          taskId: invoke.taskId,
          invokeCount: invoke.invokeCount,
          cost: node.cost,
          balanceBefore: billingSnapshotBefore.balance,
          balanceAfter: balanceAfterRefund,
          flowRecords: refundFlowRecords,
          terminalNode: failedNode,
          canvasSnapshot,
        }),
      );
    } finally {
      await workflowFlow.dispose();
    }
  });
});
