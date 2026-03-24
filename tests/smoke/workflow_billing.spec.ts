import { expect, test } from '@playwright/test';
import { getBalanceTotal } from '../../api/billing.api';
import { getNodeTaskStatus } from '../../api/task.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowBillingCases, workflowTimeouts } from '../data/workflow.data';
import { buildWorkflowRunEvidence } from '../../utils/report';

test.describe('工作流计费', () => {
  test.describe.configure({ mode: 'serial' });

  for (const billingCase of Object.values(workflowBillingCases)) {
    test(billingCase.caseName, async ({ page }, testInfo) => {
      test.setTimeout(workflowTimeouts.smokeMs);

      const workflowFlow = new WorkflowFlow(page, testInfo);

      try {
        await workflowFlow.enterWorkflowWorkspace();
        const { canvasId } = await workflowFlow.createBlankWorkflow();

        const billingFlow = new BillingFlow(workflowFlow.billingApi);
        const billingSnapshotBefore = await billingFlow.captureSnapshot();

        const node = await workflowFlow.addNode(billingCase);
        const invoke = await workflowFlow.runSelectedNode(billingCase.clickCount);

        expect(invoke.invokeCount).toBe(billingCase.expectedInvokeCount);
        expect(invoke.taskId).toBeGreaterThan(0);

        if (billingCase.expectRunLockedDuringExecution) {
          await workflowFlow.workflowPage.nodePanel.expectRunLocked();
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
          }),
        );
      } finally {
        await workflowFlow.dispose();
      }
    });
  }
});
