# AI Automation Contract (Playwright)

> 本文档是给 Cursor / Antigravity 等 Coding Agent 阅读的“规则与需求契约”。
> AI 必须遵守本文档后，才允许生成或修改代码。

## 0. 强制启动规则（精简但强约束）

1) **先读规则**：执行任何任务前，必须先阅读本 README_AI.md 的全部约束。  
2) **先给方案**：输出代码前必须先给 2–3 个候选方案与取舍。  
3) **先做稳定性评估**：任何 locator / wait 策略必须给“高/中/低”稳定性评级与理由。  
4) **最小改动原则**：默认只做“必要改动”，不得顺手重构、不得改业务语义。  
5) **确定性优先**：CI 执行路径必须可复现；禁止在 CI 运行时动态生成 selector。

## 1. 项目目标

- 并行可跑（每个 test 自给自足，不依赖顺序）
- 可维护（Page/Helper/Data/Spec 分离）
- 可解释（失败能定位到具体页面能力/等待策略/数据问题）
- AI 只做“辅助”，不做“执行者”

## 2. Locator 规则（强制）

**优先：**
- getByRole / getByLabel / getByPlaceholder
- data-testid / aria-* 属性
- 必要时 getByText（需限定范围）

**禁止：**
- nth-child / nth-of-type
- 过深 CSS 路径（>3 层）
- 纯样式 class（flex / tailwind / max-w 等）
- 基于列表序号/消息序号的定位

## 3. Wait 规则（强制）

- 禁止使用无理由的 waitForTimeout
- 优先等待“业务状态锚点”（例如：发送↔终止按钮状态）
- 对“AI 回复慢”场景：允许使用“业务冒烟通过标准”
  - 至少进入生成态（终止按钮出现 / loading 出现）
  - 不强制等待完全结束（除非用例明确需要）

## 4. 用例结构规则

- Spec 只写“测什么”，不得堆 locator、不得写复杂等待细节
- Page Object 只负责 UI 操作（不包含 AI 调用）
- Skill 只负责能力（不操作 UI）
- Agent/Orchestrator 负责“编排 Page + Skill”

## 5. Skills 清单与使用约束

### 5.1 page_context_collect
- 输出：dom.html / screenshot.png / url / 可选 console logs
- 用途：为 AI 辅助（定位/失败分析）提供上下文

### 5.2 locator_suggest
- 输入：DOM + 截图 + 元素描述
- 输出：3–5 个候选 locator + 稳定性评级 + 风险
- 约束：不得输出 nth-child；必须说明为何稳定

### 5.3 failure_triage
- 输入：失败日志 + 截图 + DOM（可选 trace）
- 输出：失败分类 + 最小修复建议（定位/等待/数据/权限/网络慢）

### 5.4 agent_enum_fetch
- 输出：系统预置 agentName 列表
- 约束：不得编造不存在的 agentName

### 5.5 chat_wait
- 等待策略：优先“发送↔终止”按钮状态；备选 bubble-dot
- 约束：不得使用固定 sleep 作为主策略

## 6. 输出格式要求（给 AI）

当被要求生成定位/等待/用例建议时：
- 先给候选方案与取舍
- 明确稳定性评级
- 最后给推荐方案
- 不要长篇解释，不要输出无关内容
