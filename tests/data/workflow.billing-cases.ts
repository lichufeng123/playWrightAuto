import { workflowPrompts } from './workflow.prompts';

export interface WorkflowBillingCase {
  caseName: string;
  nodeLabel: string;
  nodeType: string;
  prompt: string;
  expectedRemark: string;
  clickCount: number;
  expectedInvokeCount: number;
  expectRunLockedDuringExecution?: boolean;
  expectedNewFlowRecordCount?: number;
}

export const workflowBillingCases = {
  imageSingleInvokePreDeduct: {
    caseName: '计费：单次成功发起即预扣',
    nodeLabel: '图片',
    nodeType: 'image',
    prompt: workflowPrompts.billingImage,
    expectedRemark: '图片节点1个, 视频节点0个',
    clickCount: 1,
    expectedInvokeCount: 1,
    expectRunLockedDuringExecution: true,
    expectedNewFlowRecordCount: 1,
  },
  imageRapidClickGuard: {
    caseName: '计费：快速点击只允许一次成功',
    nodeLabel: '图片',
    nodeType: 'image',
    prompt: workflowPrompts.billingImage,
    expectedRemark: '图片节点1个, 视频节点0个',
    clickCount: 2,
    expectedInvokeCount: 1,
    expectRunLockedDuringExecution: true,
    expectedNewFlowRecordCount: 1,
  },
} as const satisfies Record<string, WorkflowBillingCase>;
