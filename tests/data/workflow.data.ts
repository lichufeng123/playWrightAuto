import { workflowBillingCases } from './workflow.billing-cases';
import { workflowPrompts } from './workflow.prompts';

export interface WorkflowNodeCase {
  nodeLabel: string;
  nodeType: string;
  prompt?: string;
  expectedRemark?: string;
}

export const workflowTimeouts = {
  canvasReadyMs: 45_000,
  billingMs: 60_000,
  smokeMs: 240_000,
  nodeExecutionMs: 180_000,
};

export const workflowCases = {
  smokeImage: {
    nodeLabel: '图片',
    nodeType: 'image',
    prompt: workflowPrompts.smokeImage,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
  },
  connection: {
    source: {
      nodeLabel: '图片',
      nodeType: 'image',
    } satisfies WorkflowNodeCase,
    target: {
      nodeLabel: '视频',
      nodeType: 'video',
    } satisfies WorkflowNodeCase,
  },
};

export { workflowBillingCases, workflowPrompts };
