# 工作流模块自动化落地计划

## 1. 目标

基于现有 Playwright 自动化能力，为工作流模块建立一套可维护、可扩展、可联合 API 断言的自动化体系，避免继续堆脚本式测试。

当前落地方向坚持以下原则：

- `Spec` 只描述业务意图，不写 selector
- `Flow` 负责业务编排，不直接堆页面细节
- `Page / Component` 负责页面交互与 selector 收口
- `Utils` 统一稳定性能力，禁止裸 `sleep`
- `API` 负责关键结果断言，减少 UI 结果依赖

## 2. 当前仓库适配后的建议目录

```text
PlayWright_Demo/
├── tests/
│   ├── smoke/
│   │   ├── workflow_smoke.spec.ts
│   │   ├── workflow_billing.spec.ts
│   │   └── workflow_failure.spec.ts
│   ├── data/
│   │   ├── workflow.data.ts
│   │   ├── workflow.billing-cases.ts
│   │   └── workflow.prompts.ts
│   └── helpers/
│       └── navigation.ts
├── flows/
│   ├── login.flow.ts
│   ├── workflow.flow.ts
│   └── billing.flow.ts
├── pages/
│   ├── login.page.ts
│   ├── workflow.page.ts
│   ├── node.panel.page.ts
│   └── billing.page.ts
├── components/
│   ├── drawer.component.ts
│   └── canvas.component.ts
├── utils/
│   ├── wait.ts
│   ├── retry.ts
│   ├── polling.ts
│   ├── drag.ts
│   ├── logger.ts
│   └── report.ts
├── api/
│   ├── client.ts
│   ├── task.api.ts
│   └── billing.api.ts
├── reports/
├── test-results/
└── playwright-report/
```

## 3. 目录职责

### 3.1 `tests/smoke`

- 放工作流主流程、计费、异常一致性等高价值用例
- 只描述业务流程和断言意图
- 不允许出现 selector

### 3.2 `tests/data`

- 统一管理工作流测试数据
- 将 prompt、节点配置、计费场景拆成独立文件
- 后续录制回放、自愈策略也优先复用这一层数据结构

### 3.3 `flows`

- 封装登录、进入工作流、创建画布、添加节点、执行节点、账务校验
- 组合页面对象和 API 对象
- 作为 Spec 直接依赖的业务入口

### 3.4 `pages`

- 管理独立页面级操作
- `workflow.page.ts` 仅承载工作流页面容器能力
- `node.panel.page.ts` 承载节点配置区能力
- `billing.page.ts` 仅在需要校验账单 UI 时启用

### 3.5 `components`

- 管理工作流页面内可复用的局部组件
- `canvas.component.ts` 负责画布、节点、连线、拖拽
- `drawer.component.ts` 负责节点抽屉

### 3.6 `utils`

- 提供等待、重试、轮询、拖拽、日志等跨页面通用能力
- 原则是“等条件，不等时间”

### 3.7 `api`

- 负责任务状态、画布状态、赛点余额、账单流水等接口断言
- 贯彻“UI 负责触发，API 负责校验”的架构原则

### 3.8 `reports`

- 仅当需要生成业务化二次报告时启用
- Playwright 原生结果仍落在 `test-results/` 与 `playwright-report/`

## 4. 当前实现与目标差异

### 已落地

- 工作流主流程、计费校验、刷新一致性 smoke 用例
- `workflow.flow.ts`、`billing.flow.ts`
- `workflow.page.ts`、`canvas.component.ts`、`drawer.component.ts`
- `task.api.ts`、`billing.api.ts`
- `wait.ts`、`retry.ts`、`polling.ts`、`drag.ts`、`logger.ts`

### 待补齐

- `login.flow.ts`
- `node.panel.page.ts`
- 工作流数据统一收口到 `tests/data/`
- 更丰富的计费数据驱动场景
- 可选的 `billing.page.ts` 与业务化 `reports/`

## 5. 两周实施顺序

### 第 1 周

1. 新增 `login.flow.ts`，统一登录入口与登录态恢复调用方式
2. 新增 `node.panel.page.ts`，把节点参数区能力从 `canvas.component.ts` 中拆出
3. 统一工作流数据目录到 `tests/data/`
4. 新增 `workflow.billing-cases.ts` 与 `workflow.prompts.ts`
5. 保持现有 3 个工作流 smoke 用例可运行

### 第 2 周

1. 补充计费专项数据驱动场景
2. 扩展 `task.api.ts` 与 `billing.api.ts` 的专项断言能力
3. 加强失败截图、关键接口日志、证据链输出
4. 视需要新增 `report.ts` 生成业务化报告
5. 当账单页 UI 本身进入回归范围时，再补 `billing.page.ts`

## 6. 第一周实施范围

本次代码改造完成以下事项：

- 新增 `login.flow.ts`
- 新增 `node.panel.page.ts`
- 将节点 prompt、费用、执行能力从画布组件迁移到节点面板页对象
- 新增 `workflow.billing-cases.ts`
- 新增 `workflow.prompts.ts`
- 重构工作流相关 Spec / Flow 以使用新的分层结构

## 7. 第二周实施范围

本次代码改造继续完成以下事项：

- 扩展工作流计费用例为多场景数据驱动
- 新增账务快照与“基于基线流水增量”的断言能力
- 新增节点任务受理、终态、输出产物等 API 断言能力
- 新增结构化 JSON 附件输出，补齐截图 + API 数据证据链
- 在主流程、计费、一致性用例中接入统一 evidence 报告

## 8. 验收标准

- 工作流主流程仍可创建工作流、添加节点、执行节点并完成 API 断言
- 节点面板能力不再散落在画布组件中
- 计费用例具备最小可用的数据驱动结构
- 登录流程有统一 Flow 封装，可供全局登录态构建和登录用例复用
- 计费断言不再依赖“最近一条流水碰运气”，而是基于基线快照确认新增流水
- 关键用例在 `test-results/` 中同时保留截图与结构化 API 证据
