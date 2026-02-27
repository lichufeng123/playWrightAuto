## 范围与优先级
- 本文件适用于仓库根目录及子目录。下级 `AGENTS.md` 可覆盖本文件；系统/用户指令优先级最高。
- 改动前先确认对应路径是否存在更具体的 `AGENTS.md`。

## Playwright 代码规范
- 定位优先 `getByRole`/`getByText` 等可访问性选择器，避免复杂 XPath；若必须用 XPath，写明原因。
- 等待优先用 `expect(...).toBeVisible()/toBeEnabled()` + 合理超时，避免裸 `waitForTimeout`；若必须用，注明用途。
- 复用已有 Page Object 与 helper，避免重复 selector；命名采用小驼峰，测试标题用清晰中文。

## 测试组织与超时
- 新增用例放在对应 `tests/smoke/*.spec.ts`，保持已有分组与 `mode: 'serial'` 约定。
- 超时沿用现有常量（如 180s/300s），特殊情况在用例内显式声明。

## 环境与账号
- 通过 `scripts/pw-run.js` 或 `PW_*` 环境变量切换环境，不要硬编码 baseURL/账号。
- 复用 `playwright/.auth/*.json` 登录态，不提交真实凭据。
- 业务文案（提示语、张数等）遵循现有规则，避免随意更改。

## 提交前检查
- 变更后尽量跑受影响的目标用例（如 `npx playwright test tests/smoke/agent.spec.ts -g "<case>"`）。
- 保持现有格式风格，不新增无用日志或文件。

## 错题本与技能
- 典型错误（定位/超时/环境等）解决后，按 `skills/error-notebook/references/ERROR_LOG.md` 模板记录原因与修复；遇到类似问题前先查阅该文件。
- 新增诊断脚本或参考文件时，在相关 SKILL 中引用说明。

## 路径与输出
- 测试数据放 `tests/data/`，页面对象放 `pages/`，辅助方法放 `tests/helpers/`。
- 截图等输出沿用 `test-results/...` 路径，不在根目录新增无关文件。
