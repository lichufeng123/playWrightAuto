# AI 员工 UI 自动化设计方法（参考手册）

本文汇总 AI 员工模块的 Page Object（`pages/agent.page.ts`）与用例（`tests/smoke/agent.spec.ts`）的设计理念，便于后续快速生成新用例（例如给美术员工发送消息 10 次）。

## 1. Page Object 结构与关键定位

- **入口与就绪**
  - `waitForReady()`：等待进入 `/aichat` 并保证侧栏可见。
  - `waitForAgentListReady()`：等待侧栏加载完毕（“加载中”消失、搜索框可用）。
  - `waitForChatReady()`：等待聊天输入框可编辑，发送按钮可见（是否可用由具体用例决定）。
- **核心定位器**
  - `agentList`：侧栏列表容器；`agentItemByName(name)` 查找特定员工，支持编号后缀。
  - `chatInput` / `sendButton` / `stopButton`：聊天输入与发送/终止按钮；当模板缺失导致找不到输入框时，自动回退到 `[contenteditable="true"]` / `textarea` / `input[type="text"]`。
  - `newChatButton`：新建会话入口。
  - `messageList` / `lastMessage`：消息区域定位（用于截图或读取最后消息）。
- **自愈能力**
  - `ensureAgentAvailable(name)`：员工缺失时自动调用 `addAgent(name)`；`addAgent` 通过“添加AI员工/群组”对话框检索并添加。
- **基础操作**
  - `selectAgent(name)`：选择员工进入会话。
  - `newChat()`：新建会话，确保输入框出现。
  - `sendMessage(text)`：等待输入可用后输入文本并点击发送；发送前可按需等待按钮可用。
  - `sendAndWaitReply(text, opts)`：发送并等待回复结束（当前用终止 → 发送的按钮状态变化判定）。

## 2. 典型用例设计模式

- **发送消息类**
  - 批量发送（`batch messaging`）：遍历员工列表，每个员工执行：自愈 → 选择 → 新建会话 → 等待 3s → `sendMessage`(自定义文案) → 等待 3s。
  - Note 发送（`Note messaging`）：与批量类似，但默认文案为“确认”，常用于冒烟或连通性验证。
  - 图片张数调整类：进入会话后先切换张数下拉（`getByRole('combobox').filter({ hasText: /张/ })`），优先选“4张”，若不存在则回落“2张”，再发送提示语。
  - 临时/重复发送类：同一员工可循环执行“新建会话 → 等待可编辑 → 发送 → 间隔 3s”，循环次数可用环境变量控制（如 `PW_TEMP_SEND_TIMES`），便于快速多次验证。
  - 临时“回复后确认”类：进入员工后先新建会话，再循环执行“发送长提示并等待回复完成（如 `sendAndWaitReply`，可放宽超时）→ 发送‘确认’ → 间隔 3s → 新建会话进入下一轮”，次数可通过 `PW_TEMP_REPLY_TIMES` 配置。
  - 多轮对话发送：首轮可用 `sendMessage`，后续轮次可用 `sendMessageInOngoingChat`（先输入再校验按钮可用，避免因上一轮结束时按钮禁用而卡住）。
  - 并发图片生成：可使用 `test.describe.parallel` 为多个图片/美工类员工同时发送提示语，进入会话后按需选择张数（如 1 张），再调用 `sendMessage`。
- **CRUD/置顶等管理类**
  - 添加：`addAgent(name)` 后断言可见。
  - 删除：`deleteAgent(name)` 后断言不可见。
  - 重命名：`renameAgent({ name, newName })` → 断言新名可见，再改回。
  - 置顶：`togglePinAgent(name, shouldPin)` 前后切换。
  - 清历史：`clearAgentChatHistory(name)` 触发确认对话后清空。

## 3. 用例编写步骤模板

1) **进入模块**：`const agentPage = await enterAgentPage(page); await agentPage.waitForReady();`
2) **自愈/准备数据**：`await agentPage.ensureAgentAvailable(targetName);`
3) **进入会话**：`await agentPage.selectAgent(targetName); await agentPage.newChat(); await agentPage.waitForChatReady();`（发送前统一先新建对话，避免复用旧会话造成上下文污染）
4) **发送与等待**：
   - 简单发送：`await agentPage.sendMessage('你好');`
   - 需要等待回复：`await agentPage.sendAndWaitReply('你好', { timeout: 60000 });`
   - 适当加入短暂缓冲：`await page.waitForTimeout(3000);`（仅作为过渡/动画的兜底）
5) **断言/收尾**：可检查发送按钮恢复、最后消息存在或截图留存。

## 4. 元素等待与健壮性要点

- 优先使用 `expect(...).toBeVisible()/toBeEditable()/toBeEnabled()` 等显式等待，少用裸 `waitForTimeout`。
- 自愈对话框：对话标题/输入/按钮的文案使用正则，兼容“添加AI员工/群组”。
- 发送流程：在点击发送前确保输入已填充、发送按钮已可用；回复完成优先以“终止”消失、“发送”恢复可用作为结束信号，若按钮状态异常可退化为确认输入框可编辑。

## 5. 快速生成新用例的思路

示例：“给美术员工发送‘你好’10 次”：
- 列表来源：`tests/data/agents.ts`（或动态数组）。
- 循环调用上述模板步骤，文案改为需求内容，循环次数在用例内控制。
- 若需批量场景，可参考 `batch messaging` 的结构（遍历 + 自愈 + 新建对话 + 发送 + 等待）。
