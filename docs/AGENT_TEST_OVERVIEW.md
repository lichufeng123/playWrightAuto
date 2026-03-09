# Agent 模块自动化概览

本文帮助新同事快速理解本项目中 AI 员工（agent）相关的 Page Object 定义与测试用例设计方式。

## pages/agent.page.ts：核心元素与方法
- 入口与就绪：`waitForReady()` 确认跳转到 `/aichat` 并等待左侧员工列表可见；`waitForAgentListReady()` 等待锚点员工 “列表加载完成-勿删” 可见。
- 定位器：左侧员工列表（`agentList`）、搜索框、添加/删除/置顶入口、历史记录入口、对话框元素（聊天输入框、发送按钮、提示语模板等），均优先使用 `getByRole`/`getByText` 等可访问性选择器。
- 自愈能力：`ensureAgentAvailable(name)` 缺失时自动调用 `addAgent(name)` 并验证可见；`findAgentByName` 支持带编号后缀的模糊匹配。
- 基础操作：`selectAgent` 选择员工，`newChat` 新建会话，`sendMessage` 发送内容（内置等待聊天输入框可用），`togglePinAgent` 置顶/取消，`renameAgent`、`deleteAgent`、`addAgent` 等维护类操作。
- 辅助方法：批量删除保留指定名单的员工（`deleteAllAgentsExcept`）、清空历史（`clearAgentChatHistory`）、进入历史列表、截图/网络诊断等均封装在 Page Object 中，供用例复用。

## tests/smoke/agent.spec.ts：用例结构与断言
- 组织：使用 Playwright Test，整体 `mode: 'serial'`，保持全局登录态；基础导航用例验证能进入 AI 员工模块并等待页面就绪。
- 基础 CRUD：
  - 添加、选择、置顶、重命名、删除等分别有独立用例，操作前通常调用 `ensureAgentAvailable` 并通过 `expect(...).toBeVisible()` 或结果状态校验收尾。
  - 历史与清理：有清空聊天记录、删除所有员工（保留锚点）等收尾用例。
- 批量/图片/Note 消息：
  - “batch messaging” 对 `MESSAGE_TEST_AGENTS` 逐个执行：确保员工存在、选择、`newChat`、按员工类型拼装提示语、发送后等待、截图。
  - “图片类生成用例” 对图片类员工统一选择张数（优先 4 张，缺失则 2 张）、发送特定提示语。
  - “Note messaging” 对 `Note_MESSAGE_TEST_AGENTS`：先自愈补齐员工，再选择并发送固定文案“确认”，前后各等待 3 秒。
- 断言方式：首选 `expect(locator).toBeVisible()/toBeEnabled()` 校验关键节点；发送流程后多以页面可见性、会话数量变更或截图保存作为结束标志。必要时使用有限的 `waitForTimeout` 作为缓冲，符合 AGENTS 规范。

## 运行与环境
- 通过 `playwright.config.ts` + `auth/global-setup.ts` 统一环境与账号：`PW_ENV`/`PW_USER` 自动选择 baseURL 与登录态，`storageState` 持久化在 `playwright/.auth/`。
- 直接运行单用例示例：`npx playwright test tests/smoke/agent.spec.ts -g "Note send"`；全量冒烟：`npx playwright test tests/smoke/agent.spec.ts`。

## 设计思路
- Page Object 只封装定位与原子操作，不写断言；断言集中在 spec。
- 用例依赖最小化：每条测试自行准备/验证数据，避免跨用例共享状态。
- 若遇定位或超时问题，优先查阅 `AGENTS.md` 规范与 `skills/error-notebook/references/ERROR_LOG.md` 的历史记录。 
