import { expect, test } from '@playwright/test';
import { WorkflowFlow } from '../../flows/workflow.flow';

test.describe('工作流清理', () => {
  test.describe.configure({ mode: 'serial' });

  test('清理：删除所有名字包含“项目”的工作流', async ({ page }, testInfo) => {
    test.setTimeout(600_000);

    const workflowFlow = new WorkflowFlow(page, testInfo);

    try {
      await workflowFlow.enterWorkflowWorkspace();
      const deletedCount = await workflowFlow.deleteProjectsByKeyword('项目');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    } finally {
      await workflowFlow.dispose();
    }
  });
});
