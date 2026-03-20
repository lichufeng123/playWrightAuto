import { expect, test } from '@playwright/test';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { workflowCases, workflowTimeouts } from '../data/workflow.data';

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

      await workflowFlow.reloadCanvas();

      const canvasAfterReload = await workflowFlow.taskApi.waitForEdgeCount(canvasId, 1);
      expect(canvasAfterReload.data.edges).toHaveLength(1);
      expect(canvasAfterReload.data.nodes.filter(node => node.type === 'image')).toHaveLength(1);
      expect(canvasAfterReload.data.nodes.filter(node => node.type === 'video')).toHaveLength(1);

      await expect(workflowFlow.workflowPage.canvas.nodeByType('image')).toBeVisible();
      await expect(workflowFlow.workflowPage.canvas.nodeByType('video')).toBeVisible();
    } finally {
      await workflowFlow.dispose();
    }
  });
});
