import { expect, test } from '@playwright/test';
import { getNodeProductCount, hasNodeOutput } from '../../api/task.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowCases, workflowTimeouts } from '../data/workflow.data';
import { buildWorkflowRunEvidence } from '../../utils/report';

test.describe('工作流主流程', () => {
  test.describe.configure({ mode: 'serial' });

  test('主流程：创建工作流并执行图片节点', async ({ page }, testInfo) => {
    test.setTimeout(workflowTimeouts.smokeMs);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      const { canvasId } = await workflowFlow.createBlankWorkflow();
      const node = await workflowFlow.addNode(workflowCases.smokeImage);

      const billingFlow = new BillingFlow(workflowFlow.billingApi);
      const billingSnapshotBefore = await billingFlow.captureSnapshot();

      const invoke = await workflowFlow.runSelectedNode();
      expect(invoke.invokeCount).toBe(1);
      expect(invoke.taskId).toBeGreaterThan(0);

      const runningNode = await workflowFlow.taskApi.waitForNodeTaskId(
        canvasId,
        node.nodeId,
        invoke.taskId,
        workflowTimeouts.billingMs,
      );
      expect(runningNode.data.taskInfo?.taskId).toBe(String(invoke.taskId));

      const successNode = await workflowFlow.taskApi.waitForNodeTerminalStatus(
        canvasId,
        node.nodeId,
        workflowTimeouts.nodeExecutionMs,
      );
      expect(successNode.data.taskInfo?.status).toBe('success');
      expect(hasNodeOutput(successNode)).toBeTruthy();
      expect(getNodeProductCount(successNode)).toBeGreaterThan(0);

      const balanceAfter = await billingFlow.waitForBalanceDelta(
        billingSnapshotBefore.balance,
        -node.cost,
        workflowTimeouts.billingMs,
      );
      expect(balanceAfter.giftBalance).toBeLessThan(billingSnapshotBefore.balance.giftBalance);

      const flowRecords = await billingFlow.waitForFlowRecordsSince(
        billingSnapshotBefore,
        record =>
          record.flowName === 'WORKFLOW' &&
          record.flowPoints === -node.cost &&
          (record.remark ?? '').includes(workflowCases.smokeImage.expectedRemark ?? ''),
        {
          timeoutMs: workflowTimeouts.billingMs,
          minCount: 1,
        },
      );
      expect(flowRecords[0]?.flowType).toBe('FUNCTION_USAGE');

      const canvasSnapshot = await workflowFlow.captureCanvasSnapshot('主流程-执行后画布快照', canvasId);
      await workflowFlow.logger.attachJson(
        '主流程-执行证据',
        buildWorkflowRunEvidence({
          caseName: '主流程：创建工作流并执行图片节点',
          canvasId,
          nodeId: node.nodeId,
          nodeType: workflowCases.smokeImage.nodeType,
          taskId: invoke.taskId,
          invokeCount: invoke.invokeCount,
          cost: node.cost,
          balanceBefore: billingSnapshotBefore.balance,
          balanceAfter,
          flowRecords,
          terminalNode: successNode,
          canvasSnapshot,
        }),
      );
    } finally {
      await workflowFlow.dispose();
    }
  });
});
