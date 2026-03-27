---
name: workflow-test-automation
description: 理解、扩展、排查或评审当前仓库中的 workflow 自动化框架。用于处理工作流模块的 Playwright 测试，包括新增 smoke、计费、失败、低余额等场景，梳理 Spec、Flow、Page、Component、API、Utils 的调用链，修复 workflow 相关定位与等待问题，或在新增代码时保持当前分层规则不被破坏。
---

# 工作流自动化

## 快速开始

- 需要快速看懂分层关系、入口文件、推荐阅读顺序时，先看 [references/architecture.md](references/architecture.md)。
- 需要新增、修改、Review 工作流用例时，先看 [references/playbook.md](references/playbook.md)。
- `docs/workflow-automation-plan.md` 作为背景资料使用，不要把它当成日常开发操作手册。

## 硬性约束

- 不要在 `tests/smoke/*.spec.ts` 里写 selector。
- 新增业务步骤前，优先复用 `WorkflowFlow` 和 `BillingFlow`，不要先写测试专用拼装逻辑。
- 页面细节留在 `pages/` 或 `components/`，不要往 `flows/` 里塞页面实现。
- 任务状态、余额、流水等关键结果必须优先走 API 校验，不要只信 UI 文案。
- 优先使用条件等待，如 `expect.poll`、接口轮询、可见性等待；没有稳定信号时才考虑极少量兜底等待。
- 工作流测试数据统一放在 `tests/data/`。
- 高价值场景要保留 `StepLogger` 与 `utils/report.ts` 的证据输出。

## 工作方式

1. 先判断场景类型：smoke、billing、failure、low-balance、consistency。
2. 从最接近目标场景的现有 spec 开始改，不要平地起高楼。
3. 顺着调用链往下看：`Spec -> Flow -> Page/Component + API -> Utils`。
4. 如果只是换参数、prompt、预期值，先改 `tests/data/`。
5. 只有出现新的业务步骤或新的断言类型时，才去补 `Flow`、`Page`、`API`。
6. 改完后优先跑最小范围命令验证。

## 用例入口选择

- `workflow_smoke.spec.ts`：主流程成功链路。
- `workflow_billing.spec.ts`：预扣、重复点击拦截、流水校验。
- `workflow_low_balance.spec.ts`：低余额拦截。
- `workflow_failure.spec.ts`：刷新一致性、失败返还现状。

## 项目特殊规则

- 计费断言固定使用“快照基线 + 差值轮询 + 新增流水匹配”，不要自己发明一套新账务校验。
- 低余额场景必须使用 `lowBalanceUser`。
- 当前敏感词失败返还用例故意保留为 `expected failure`，因为 `test` 环境还不能稳定进入预期返还链路。
- 图片节点参数面板比较脆，别在 spec 里临时乱点节点；优先复用 `WorkflowFlow.addNode()` 和 `NodePanelPage.isPanelReady()/waitForPanelReady()`。

## 验证建议

- workflow 相关运行优先用 `node scripts/pw-run.js --env test -- ...`，这样环境和账号切换更明确。
- 只想验证 import 或用例注册是否正常时，先跑 `--list`。
- 做业务验证时，只跑最小匹配的 spec 或 `-g` 过滤后的单条 case。
