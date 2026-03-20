import { expect, test } from '@playwright/test';
import { getBalanceTotal } from '../../api/billing.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowCases, workflowTimeouts } from '../data/workflow.data';

test.describe('工作流计费', () => {
  test.describe.configure({ mode: 'serial' });

  test('计费：发起即预扣且快速点击只执行一次', async ({ page }, testInfo) => {
    test.setTimeout(workflowTimeouts.smokeMs);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      await workflowFlow.createBlankWorkflow();

      const billingFlow = new BillingFlow(workflowFlow.billingApi);
      const balanceBefore = await billingFlow.getBalance();

      const node = await workflowFlow.addNode(workflowCases.billingImage);
      const invoke = await workflowFlow.runSelectedNode(2);

      expect(invoke.invokeCount).toBe(1);
      expect(invoke.taskId).toBeGreaterThan(0);

      const balanceAfter = await billingFlow.waitForBalanceDelta(
        balanceBefore,
        -node.cost,
        workflowTimeouts.billingMs,
      );
      expect(getBalanceTotal(balanceAfter)).toBe(getBalanceTotal(balanceBefore) - node.cost);

      const latestFlowRecord = await billingFlow.waitForLatestFlowRecord(
        record =>
          record.flowName === 'WORKFLOW' &&
          record.flowPoints === -node.cost &&
          (record.remark ?? '').includes(workflowCases.billingImage.expectedRemark),
        workflowTimeouts.billingMs,
      );

      expect(latestFlowRecord.flowType).toBe('FUNCTION_USAGE');
      expect(latestFlowRecord.remark ?? '').toContain(workflowCases.billingImage.expectedRemark);
    } finally {
      await workflowFlow.dispose();
    }
  });
});
