import { CameraControlOptions } from '../../pages/node.panel.page';
import { workflowBillingCases } from './workflow.billing-cases';
import { workflowPrompts } from './workflow.prompts';

export interface WorkflowNodeCase {
  nodeLabel: string;
  nodeType: string;
  prompt?: string;
  expectedRemark?: string;
  model?: string;
  resolution?: string;
  aspectRatio?: string;
  generationCount?: number | string;
  cameraControl?: CameraControlOptions;
}

export interface WorkflowFailureCase extends WorkflowNodeCase {
  expectedTerminalStatuses?: string[];
}

export interface WorkflowSmokeCase extends WorkflowNodeCase {
  caseName: string;
  expectedOutputCount?: number;
  expectModelChanged?: boolean;
  expectCameraControl?: boolean;
  knownIssue?: string;
}

export const workflowTimeouts = {
  canvasReadyMs: 45_000,
  billingMs: 60_000,
  assetMs: 60_000,
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
  failureSensitiveImage: {
    nodeLabel: '图片',
    nodeType: 'image',
    model: '即梦5.0',
    prompt: workflowPrompts.failureSensitive,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedTerminalStatuses: ['failed', 'fail', 'failure', 'error'],
  } satisfies WorkflowFailureCase,
};

export const workflowSmokeCases = [
  {
    caseName: '主流程：图片节点默认配置可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    prompt: workflowPrompts.smokeImage,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 1,
    expectCameraControl: true,
  },
  {
    caseName: '主流程：切换模型后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    model: '即梦5.0',
    prompt: workflowPrompts.smokeImageModel,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 1,
    expectModelChanged: true,
    expectCameraControl: true,
    knownIssue:
      '当前 test 环境下，图片节点切换到 即梦5.0 后会返回 1099 未知异常，任务无法稳定成功结束。',
  },
  {
    caseName: '主流程：切换分辨率后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    resolution: '2K',
    prompt: workflowPrompts.smokeImageResolution,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 1,
    expectCameraControl: true,
  },
  {
    caseName: '主流程：切换宽高比后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    aspectRatio: '16:9',
    prompt: workflowPrompts.smokeImageAspectRatio,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 1,
    expectCameraControl: true,
  },
  {
    caseName: '主流程：切换生成张数后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    generationCount: 2,
    prompt: workflowPrompts.smokeImageGenerationCount,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 2,
    expectCameraControl: true,
  },
  {
    caseName: '主流程：修改摄影参数后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    cameraControl: {
      aperture: 'f/11',
      focalLength: '85mm',
    },
    prompt: workflowPrompts.smokeImageCameraControl,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 1,
    expectCameraControl: true,
  },
  {
    caseName: '主流程：组合参数修改后可执行成功',
    nodeLabel: '图片',
    nodeType: 'image',
    resolution: '2K',
    aspectRatio: '16:9',
    generationCount: 2,
    cameraControl: {
      aperture: 'f/11',
      focalLength: '85mm',
    },
    prompt: workflowPrompts.smokeImageCombo,
    expectedRemark: workflowBillingCases.imageSingleInvokePreDeduct.expectedRemark,
    expectedOutputCount: 2,
    expectCameraControl: true,
  },
] as const satisfies readonly WorkflowSmokeCase[];

export { workflowBillingCases, workflowPrompts };
