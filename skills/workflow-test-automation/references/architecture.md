# Workflow 自动化架构速览

## 1. 层级关系

- `tests/smoke/*.spec.ts`
  - 只描述业务场景、步骤和核心断言。
- `flows/*.ts`
  - 业务编排层。
  - `WorkflowFlow` 负责 UI 驱动和任务链路。
  - `BillingFlow` 负责余额/流水等待与账务判断。
- `pages/*.ts` / `components/*.ts`
  - 页面与局部区域封装。
  - `workflow.page.ts` 是页面容器。
  - `node.panel.page.ts` 是节点参数区。
  - `canvas.component.ts` / `drawer.component.ts` 是画布与抽屉。
- `api/*.ts`
  - `task.api.ts` 查画布、节点、连线、任务状态。
  - `billing.api.ts` 查余额与消费流水。
- `utils/*.ts`
  - 等待、重试、轮询、拖拽、日志、报告。

## 2. 运行时主链路

以计费用例为例：

1. `workflow_billing.spec.ts`
2. `WorkflowFlow.enterWorkflowWorkspace()`
3. `WorkflowFlow.createBlankWorkflow()`
4. `BillingFlow.captureSnapshot()`
5. `WorkflowFlow.addNode()`
6. `WorkflowFlow.runSelectedNode()`
7. `TaskApi.waitForNodeTaskId()` / `waitForNodeTerminalStatus()`
8. `BillingFlow.waitForBalanceDelta()` / `waitForFlowRecordsSince()`
9. `StepLogger.attachJson()` + `buildWorkflowRunEvidence()`

## 3. 推荐阅读顺序

如果需要快速读懂当前实现，按下面顺序：

1. `tests/smoke/workflow_billing.spec.ts`
2. `tests/data/workflow.billing-cases.ts`
3. `flows/workflow.flow.ts`
4. `flows/billing.flow.ts`
5. `pages/workflow.page.ts`
6. `pages/node.panel.page.ts`
7. `components/canvas.component.ts`
8. `api/task.api.ts`
9. `api/billing.api.ts`
10. `utils/wait.ts` / `retry.ts` / `polling.ts`

## 4. 关键文件职责

- `tests/data/workflow.data.ts`
  - 工作流共用节点 case、失败 case、timeout。
- `tests/data/workflow.billing-cases.ts`
  - 计费数据驱动 case 定义。
- `tests/data/workflow.prompts.ts`
  - prompt 数据。
- `tests/helpers/navigation.ts`
  - 进入 workflow 模块的统一入口。
- `utils/logger.ts`
  - 截图、JSON、文本证据统一落盘。
- `utils/report.ts`
  - 结构化 evidence 构造。

## 5. 当前已知业务现状

- 低余额拦截已可稳定验证，必须使用 `lowBalanceUser`。
- “任务失败后返还赛点”当前保留为 `expected failure`：
  - 现状不是简单“失败后不返还”。
  - 当前 `test` 环境下，指定敏感词 case 往往拿到 `taskId` 后长期停在 `running`，未稳定进入失败返还链路。
