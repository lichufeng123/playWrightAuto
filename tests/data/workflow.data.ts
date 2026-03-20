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
    prompt: '自动化测试图片：生成一张极简风白色陶瓷杯产品图，纯色背景，无文字无人物。',
    expectedRemark: '图片节点1个, 视频节点0个',
  },
  billingImage: {
    nodeLabel: '图片',
    nodeType: 'image',
    prompt: '自动化计费校验图片：生成一张简洁的白底香水瓶产品图，无文字。',
    expectedRemark: '图片节点1个, 视频节点0个',
  },
  connection: {
    source: {
      nodeLabel: '图片',
      nodeType: 'image',
    },
    target: {
      nodeLabel: '视频',
      nodeType: 'video',
    },
  },
};
