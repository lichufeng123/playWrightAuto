# Playwright UI 自动化测试工程

这是一个基于 **Playwright + TypeScript** 的 UI 自动化项目，当前重点覆盖 3 类业务：

- `AI员工`
- `AI群组`
- `Workflow`

项目目标不是堆脚本，而是把 UI 触发、页面交互、业务编排、接口校验、证据输出收成一套能持续维护的工程化框架。

## 技术栈

- Core: [Playwright](https://playwright.dev/)
- Language: [TypeScript](https://www.typescriptlang.org/)
- Runner: Playwright Test
- Pattern: `Page Object + Flow + API + Test Data`

## 当前目录结构

```text
PlayWright_Demo/
├── auth/                       # 登录态构建、global setup
├── api/                        # 业务接口封装（任务、计费、资产等）
├── components/                 # 可复用页面局部组件
├── flows/                      # 业务编排层
├── pages/                      # 页面对象层
├── tests/
│   ├── data/                   # 测试数据
│   ├── helpers/                # 导航与辅助方法
│   └── smoke/                  # 冒烟与高价值回归场景
├── utils/                      # 通用等待、重试、日志、证据能力
├── docs/                       # 项目文档与交接材料
├── playwright.config.ts
└── package.json
```

## 核心模块

### 1. AI 员工

相关文件：

- [agent.page.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/pages/agent.page.ts)
- [agent.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/agent.spec.ts)
- [agents.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/data/agents.ts)

当前能力：

- 员工缺失时自动补齐
- 批量发送业务提示词
- 多轮对话发送与回复完成等待
- 图片类员工张数切换
- 历史、清理、置顶、重命名、删除等管理场景

### 2. AI 群组

相关文件：

- [group.page.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/pages/group.page.ts)
- [group.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/group.spec.ts)
- [group.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/data/group.ts)

当前能力：

- 4 个策略群组的数据驱动长 prompt 发送
- 两轮对话链路：`业务 prompt -> 等回复完成 -> 发送“确认” -> 再等回复完成`
- 串行 `batch messaging`
- 四群组并发发送 `parallel messaging`
- 群组缺失时自动补齐

### 3. Workflow

相关文件：

- [workflow.flow.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/flows/workflow.flow.ts)
- [workflow.editor.page.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/pages/workflow.editor.page.ts)
- [node.panel.page.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/pages/node.panel.page.ts)
- [workflow_smoke.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/workflow_smoke.spec.ts)
- [workflow_billing.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/workflow_billing.spec.ts)
- [workflow_failure.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/workflow_failure.spec.ts)
- [workflow_low_balance.spec.ts](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/tests/smoke/workflow_low_balance.spec.ts)

当前能力：

- 组件层 -> 页面层 -> 业务编排层 -> 用例层 的分层结构
- 图片节点主流程 smoke
- 计费扣减 / 快速点击幂等 / 低余额拦截 / 失败返还
- 任务 API、计费 API、资产库 API 联合校验
- 生成产物入库校验，支持“成功有新增 / 失败或拦截不新增”

## 设计原则

### 1. Page / Component 只做交互，不做业务断言

- `pages/` 与 `components/` 负责定位、原子操作、页面级等待
- 业务断言尽量放在 spec 或 flow 中完成

### 2. Flow 负责业务编排

- `flows/` 负责把 UI 操作、接口校验、日志证据串成完整业务动作
- Spec 不直接碰底层 selector

### 3. 数据驱动优先

- 测试数据优先收敛在 `tests/data/`
- Prompt、群组名、员工名、workflow 场景参数不要散写在 spec 各处

### 4. 等条件，不等时间

- 优先使用 `expect(...)`、`waitForResponse(...)`、轮询等显式等待
- `waitForTimeout` 只作为动画/状态切换的小缓冲，不当主逻辑

### 5. 并行与串行分开设计

- 需要共享上下文、容易互相污染的链路，用 `serial`
- 适合隔离运行的链路，再明确放到 `parallel`

## 快速开始

### 安装依赖

```bash
npm install
```

### 常用命令

```bash
# 全量运行
npx playwright test

# AI 员工批量消息
npm run test:batch

# AI 群组
npx playwright test tests/smoke/group.spec.ts --project=chromium

# Workflow 主流程
npx playwright test tests/smoke/workflow_smoke.spec.ts --project=chromium

# 查看报告
npx playwright show-report
```

## 环境与账号切换

本项目把 `BaseURL / 登录账号 / storageState` 做了统一收敛，避免切环境后还复用错登录态。

详细说明见：

- [ENV_AND_AUTH.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/ENV_AND_AUTH.md)
- [切换账号.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/切换账号.md)

常用环境变量：

- `PW_ENV=test|prod`
- `PW_USER=testUser|prodUser|lowBalanceUser`
- `BASE_URL`
- `PW_REFRESH_STATE=1`

PowerShell 示例：

```powershell
$env:PW_ENV = 'prod'
$env:PW_USER = 'prodUser'
npx playwright test
```

## 推荐阅读

- [AGENT_TEST_OVERVIEW.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/AGENT_TEST_OVERVIEW.md)
- [AI_AGENT_AUTOMATION_GUIDE.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/AI_AGENT_AUTOMATION_GUIDE.md)
- [workflow-refactor-handoff.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/workflow-refactor-handoff.md)
- [UI 自动化中的分层设计.md](/c:/Users/Insight/PycharmProjects/PlayWright_Demo/docs/UI 自动化中的分层设计.md)

## 说明

- `docs/workflow-refactor-handoff.md` 与 `docs/workflow-automation-plan.md` 属于历史交接/规划文档，保留时间线，不按“当前实现快照”去强行改写。
- 当前仓库是长期演进中的自动化工程，不要只盯某一个 spec 文件理解全局，优先从 README、`docs/` 和 `tests/data/` 建上下文。
