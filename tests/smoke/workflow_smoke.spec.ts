import { expect, test } from '@playwright/test';
import { WorkflowNode, getNodeProductCount, hasNodeOutput } from '../../api/task.api';
import { BillingFlow } from '../../flows/billing.flow';
import { WorkflowFlow } from '../../flows/workflow.flow';
import { WorkflowSmokeCase, workflowSmokeCases, workflowTimeouts } from '../data/workflow.data';
import { buildWorkflowRunEvidence } from '../../utils/report';

const defaultImageModelKey = 'gemini-3.1-flash-image-preview';
const workflowSmokeTitle = '\u5de5\u4f5c\u6d41\u4e3b\u6d41\u7a0b';
const imageDownloadLabel = '\u6267\u884c\u6210\u529f-\u56fe\u7247';
const canvasSnapshotSuffix = '\u6267\u884c\u540e\u753b\u5e03\u5feb\u7167';
const evidenceSuffix = '\u6267\u884c\u8bc1\u636e';
const generationCountSuffix = '\u5f20';

function readNodeParam(node: WorkflowNode, key: string): unknown {
  return node.data.params?.[key];
}

function readStringParam(node: WorkflowNode, key: string): string {
  const value = readNodeParam(node, key);
  return typeof value === 'string' ? value : '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function parseGenerationCount(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const matched = value.match(/\d+/);
  return matched ? Number(matched[0]) : null;
}

function extractProductUrls(node: WorkflowNode): string[] {
  const productUrls = Array.isArray(node.data.product)
    ? node.data.product
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

  if (productUrls.length > 0) {
    return productUrls;
  }

  if (typeof node.data.value === 'string' && /^https?:\/\//.test(node.data.value)) {
    return [node.data.value];
  }

  return [];
}

function assertImageNodeParams(node: WorkflowNode, smokeCase: WorkflowSmokeCase): void {
  expect(readStringParam(node, 'prompt')).toBe(smokeCase.prompt);

  if (smokeCase.resolution) {
    expect(readStringParam(node, 'resolution')).toBe(smokeCase.resolution);
  }

  if (smokeCase.aspectRatio) {
    expect(readStringParam(node, 'aspect_ratio')).toBe(smokeCase.aspectRatio);
  }

  if (smokeCase.generationCount != null) {
    expect(readNodeParam(node, 'gen_count')).toBe(parseGenerationCount(smokeCase.generationCount));
  }

  if (smokeCase.expectCameraControl) {
    expect(readNodeParam(node, 'cameraControl')).toEqual(expect.any(Object));
  }

  if (smokeCase.expectModelChanged) {
    const modelKey = readStringParam(node, 'model');
    expect(modelKey).not.toBe('');
    expect(modelKey).not.toBe(defaultImageModelKey);
  }
}

test.describe(workflowSmokeTitle, () => {
  test.describe.configure({ mode: 'serial' });

  for (const smokeCase of workflowSmokeCases) {
    test(smokeCase.caseName, async ({ page }, testInfo) => {
      test.setTimeout(workflowTimeouts.smokeMs);
      if (smokeCase.knownIssue) {
        test.fail(true, smokeCase.knownIssue);
      }

      const workflowFlow = new WorkflowFlow(page, testInfo);

      try {
        await workflowFlow.enterWorkflowWorkspace();
        const { canvasId } = await workflowFlow.createBlankWorkflow();
        const node = await workflowFlow.addNode(smokeCase);

        if (smokeCase.model) {
          const selectedModel = await workflowFlow.workflowPage.nodePanel.readModel();
          expect(normalizeText(selectedModel)).toContain(normalizeText(smokeCase.model));
        }

        if (smokeCase.resolution) {
          await expect
            .poll(async () => await workflowFlow.workflowPage.nodePanel.readResolution())
            .toContain(smokeCase.resolution);
        }

        if (smokeCase.aspectRatio) {
          await expect
            .poll(async () => await workflowFlow.workflowPage.nodePanel.readAspectRatio())
            .toContain(smokeCase.aspectRatio);
        }

        if (smokeCase.generationCount != null) {
          const expectedGenerationCountText = `${parseGenerationCount(smokeCase.generationCount)}${generationCountSuffix}`;
          await expect
            .poll(async () => await workflowFlow.workflowPage.nodePanel.readGenerationCount())
            .toContain(expectedGenerationCountText);
        }

        if (smokeCase.expectCameraControl) {
          await workflowFlow.workflowPage.nodePanel.expectCameraControlVisible();
        }

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

        if (smokeCase.expectedOutputCount != null) {
          expect(getNodeProductCount(successNode)).toBe(smokeCase.expectedOutputCount);
        }
        assertImageNodeParams(successNode, smokeCase);

        const productUrls = extractProductUrls(successNode);
        for (let index = 0; index < productUrls.length; index += 1) {
          const label =
            productUrls.length === 1
              ? imageDownloadLabel
              : `${imageDownloadLabel}-${index + 1}`;
          await workflowFlow.logger.downloadFile(label, productUrls[index]);
        }

        const balanceAfter = await billingFlow.waitForBalanceDelta(
          billingSnapshotBefore.balance,
          -node.cost,
          workflowTimeouts.billingMs,
        );

        const flowRecords = await billingFlow.waitForFlowRecordsSince(
          billingSnapshotBefore,
          record =>
            record.flowName === 'WORKFLOW' &&
            record.flowPoints === -node.cost &&
            (record.remark ?? '').includes(smokeCase.expectedRemark ?? ''),
          {
            timeoutMs: workflowTimeouts.billingMs,
            minCount: 1,
          },
        );
        expect(flowRecords[0]?.flowType).toBe('FUNCTION_USAGE');

        const canvasSnapshot = await workflowFlow.captureCanvasSnapshot(
          `${smokeCase.caseName}-${canvasSnapshotSuffix}`,
          canvasId,
        );
        await workflowFlow.logger.attachJson(
          `${smokeCase.caseName}-${evidenceSuffix}`,
          buildWorkflowRunEvidence({
            caseName: smokeCase.caseName,
            canvasId,
            nodeId: node.nodeId,
            nodeType: smokeCase.nodeType,
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
  }
});
