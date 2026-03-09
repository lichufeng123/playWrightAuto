# Skill: agent-doc-update

## 作用
确保每次改动 AI 员工相关代码时同步更新文档 `docs/AI_AGENT_AUTOMATION_GUIDE.md`，保持用例/定位/等待策略与实现一致。

## 触发条件
- 改动以下文件/目录任意一项：
  - `pages/agent.page.ts`
  - `tests/smoke/agent.spec.ts`
  - `tests/smoke/fast_agent.spec.ts`
  - `tests/data/agents.ts`
  - 其他 AI 员工相关辅助文件（如 navigation/helper 的入口调整）

## 操作步骤
1) **识别改动**：在开始修改前，确认是否触发条件；触发则加载本 skill。
2) **记录变更点**：完成代码改动后，整理本次新增/修改的：
   - 新增或变更的定位器/方法/等待逻辑
   - 新增或调整的用例模式（批量发送、Note 发送、CRUD 等）
   - 新的输入数据来源（如新增/调整员工列表）
3) **更新文档**：在 `docs/AI_AGENT_AUTOMATION_GUIDE.md` 对应章节补充：
   - 变更点描述（简洁 bullet）
   - 使用方式/示例（如调用顺序、超时策略、等待信号）
4) **自查**：提交前检查文档是否覆盖上述变更，并在答复中说明“已更新 AI_AGENT_AUTOMATION_GUIDE.md”。

## 输出要求
- 在最终答复中明确已更新文档，并概括更新要点。
- 若未满足触发条件，可说明“本次未触发 agent-doc-update skill”。
