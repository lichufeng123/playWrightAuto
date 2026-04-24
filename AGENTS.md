# Repository Guidelines

## Project Structure & Module Organization
这是一个基于 Playwright + TypeScript 的 UI 自动化仓库。`pages/` 放页面对象，`components/` 放可复用页面片段，`flows/` 负责编排业务流程，`api/` 封装后端接口，`utils/` 提供等待、重试、报告等通用能力。测试主目录是 `tests/`：`tests/smoke/*.spec.ts` 放高价值回归，`tests/data/` 放测试数据，`tests/helpers/` 放导航和断言辅助，`tests/api/` 保留 API 校验脚本。环境初始化与登录态在 `auth/`，项目说明和交接材料在 `docs/`。

## Build, Test, and Development Commands
先执行 `npm install` 安装 Node 依赖。常用运行命令：
- `npm run test:ui:test`：按测试环境配置运行默认 Playwright 套件。
- `npm run test:batch`：在 Chromium 中跑 AI 员工批量发送场景。
- `npx playwright test tests/smoke/workflow_smoke.spec.ts --project=chromium`：只回归 workflow 主链路。
- `npx playwright show-report`：查看 HTML 测试报告。
- `npm run report:batch`：汇总批量场景截图报告。
如需跑 `tests/api/` 下的 Python 用例，使用 `python -m pytest tests/api -m api`。

## Coding Style & Naming Conventions
沿用现有分层：页面交互放 `*.page.ts`，业务编排放 `*.flow.ts`，测试文件统一用 `*.spec.ts`。TypeScript 代码保持 4 空格缩进、单引号、清晰命名：类用 `PascalCase`，方法和变量用 `camelCase`，测试标题描述用户可见行为。仓库未接入独立 ESLint/Prettier 配置，提交前至少确保 Playwright 与 TypeScript 诊断通过。优先使用 `getByRole`、`getByText` 和显式 `expect` 等待，避免硬编码 `baseURL`、账号或长时间 `waitForTimeout`。

## Testing Guidelines
新增 UI 用例优先放入 `tests/smoke/`，并复用 `tests/data/` 中的数据，别把 prompt、员工名、群组名散写进 spec。涉及登录的场景复用 `playwright/.auth/*.json`，不要提交真实凭据。改动页面对象或 flow 后，至少补跑受影响模块；涉及报告或截图的断言，检查输出是否落在 `test-results/` 或 `playwright-report/`。

## Commit & Pull Request Guidelines
当前提交历史以中文、范围优先的摘要为主，例如 `新增AI员工文本员工批量发送用例`、`重构 workflow 模块分层`。保持“一次提交只做一件事”，推荐格式为“模块/场景 + 动作/结果”。PR 需写清影响范围、运行环境（如 `test` 或 `prod`）、已执行命令，并在 UI 变更时附上报告、截图或关键日志；有关联需求或缺陷单就顺手挂上，别让评审靠猜。

## Security & Configuration Tips
敏感配置放 `.env.local`，通过 `PW_ENV`、`PW_USER`、`BASE_URL`、`PW_REFRESH_STATE` 切环境和账号，不要把凭据写进代码或测试数据。生成物、日志和截图统一放在既有输出目录，别往仓库根目录随手丢文件。
