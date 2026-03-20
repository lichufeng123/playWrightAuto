import { expect, test } from '@playwright/test';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowCases, workflowTimeouts } from '../data/workflow.data';

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
      const balanceBefore = await billingFlow.getBalance();

      const invoke = await workflowFlow.runSelectedNode();
      expect(invoke.invokeCount).toBe(1);
      expect(invoke.taskId).toBeGreaterThan(0);

      const runningNode = await workflowFlow.taskApi.waitForNodeStatus(
        canvasId,
        node.nodeId,
        ['running', 'success'],
        workflowTimeouts.billingMs,
      );
      expect(runningNode.data.taskInfo?.taskId).toBe(String(invoke.taskId));

      const successNode = await workflowFlow.taskApi.waitForNodeStatus(
        canvasId,
        node.nodeId,
        'success',
        workflowTimeouts.nodeExecutionMs,
      );
      expect(successNode.data.taskInfo?.status).toBe('success');

      const balanceAfter = await billingFlow.waitForBalanceDelta(
        balanceBefore,
        -node.cost,
        workflowTimeouts.billingMs,
      );
      expect(balanceAfter.giftBalance).toBeLessThan(balanceBefore.giftBalance);
    } finally {
      await workflowFlow.dispose();
    }
  });
});
