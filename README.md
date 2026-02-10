# Playwright UI 自动化测试工程

这是一个基于 **Playwright + TypeScript** 的 UI 自动化测试项目，旨在构建一个**工程化、高可维护、支持并行执行**的自动化测试框架。

## 🛠 技术栈

- **Core**: [Playwright](https://playwright.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Pattern**: Page Object Model (POM)
- **Runner**: Playwright Test Runner (Parallel Execution)

## 📂 项目结构

```
PlayWright_Demo/
├── auth/                   # 认证相关 (Global Setup/Storage State)
├── data/                   # 测试数据
├── pages/                  # Page Object 页面对象层 (只封装元素和操作)
│   ├── login.page.ts       # 登录页
│   ├── home.page.ts        # 首页
│   ├── squeeze.page.ts     # 业务承接页
│   └── agent.page.ts       # AI 员工模块页
├── tests/                  # 测试用例层 (只负责业务流程和断言)
│   ├── auth/               # 认证测试
│   ├── smoke/              # 冒烟测试
│   └── ...
├── playwright.config.ts    # Playwright 配置文件
└── package.json            # 依赖管理
```

## ✨ AI 员工测试专项 (AI Agent Testing)

本项目针对 AI 员工模块构建了深度增强的自动化能力：

### 1. 强力环境清理 (Strict Cleanup)
- **双重完成判定**：清理逻辑必须同时满足“看到已加载全部”标志位且“列表中仅剩下预置锚点”才会退出，极大提升了环境幂等性。
- **自动去重**：自动识别并删除由于并发或重命名产生的重复员工副本（如 `员工名(1)`）。
- **滚动加载支持**：内置侧边栏自动滚动逻辑，可处理大型员工列表的懒加载。

### 2. 批量消息发送能力 (Batch Messaging)
- **多维度覆盖**：支持对 29+ 员工进行参数化测试。
- **业务提示词映射**：根据员工类型（视频/图片/PPT/美工）自动匹配最高质量的业务 Prompts。
- **性能优化**：通过检测 `stopButton` (终止按钮) 出现即判定发送成功，将单个生成类用例耗时缩短 80% 以上。

### 3. 自愈与鲁棒性 (Self-Healing & Resilience)
- **自愈式添加**：`ensureAgentAvailable` 逻辑在发现目标员工缺失时，会自动触发搜索并从弹窗添加，确保测试链不中断。
- **Dialog 状态跟踪**：优化了弹窗式 UI 的交互，使用精确匹配和稳定等待策略，解决了复杂表单下的点击冲突。
- **账户余额监测**：内置“赛点余额不足”检测，能自动识别由于资产原因导致的生成失败并抛出清晰异常。

### 4. 视觉化管理与报告 (Reporting)
- **自动化快照**：批量测试运行后，会自动在 `test-results/batch-screenshots/` 下生成以员工命名的全屏截图，方便直观校验 UI 渲染效果。
- **隔离执行策略**：通过 worker 隔离确保并行执行时数据不冲突，大幅提升 CI 效率。

## 📐 设计原则 (Design Principles)

本项目严格遵循以下设计原则，贡献代码时请务必遵守：

### 1. Page Object 职责单一
Page Object **只封装**：
- 页面结构定义 (Locators)
- 原子操作方法 (如 `click`, `fill`, `select`)
- 页面级/组件级的状态等待 (`waitForReady`)

**❌ 禁止在 Page Object 中编写业务断言 (Assertions)**。断言应始终保留在 Spec 文件中。

### 2. Spec 文件职责
Spec 文件 **只负责**：
- 组合业务流程
- 调用 Page Object 提供的方法
- 执行业务结果断言

### 3. 并行执行 (Parallelism First)
- 所有 Test Case 必须设计为**独立运行**。
- 禁止 Test Case 之间存在数据依赖或执行顺序依赖。
- 每个 Test 需自行负责 Setup (如 `enterAgentPage` 辅助函数)。

### 4. 动态页面处理
对于 SPA (单页应用) 和动态加载内容：
- 区分 **Page Ready** (页面加载完成) 与 **Business Ready** (业务操作生效)。
- 使用显式等待 (如 `waitForResponse`, `expect(locator).toBeVisible()`)，避免硬编码 `waitForTimeout`。

### 5. 元素定位策略
- **Scoped Locators**: 优先使用容器级定位 (如 `page.getByRole('complementary').getByText(...)`)，减少全局查找冲突。
- **Resilient Selectors**: 优先使用面向用户的定位方式 (Role, Text, Label)，避免 CSS/XPath 依赖 DOM 结构。

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 运行测试
运行所有测试 (并行模式)：
```bash
# 运行所有测试
npx playwright test

# 运行 AI 员工批量发送消息测试 (串行以保证稳定性)
npm run test:batch

# 生成批量测试截图报告
npm run report:batch
```

查看通用测试报告：
```bash
npx playwright show-report
```

## 🌍 环境与账号切换 (Smooth Switching)

为避免“切到正式环境但登录态仍来自测试环境”的坑，本项目将 **BaseURL / 登录账号 / StorageState** 做了统一收敛：
- 通过环境变量切换环境与账号
- 登录态按“环境 + 账号”缓存到 `playwright/.auth/`，互不干扰

实现原理与代码位置说明见：`docs/ENV_AND_AUTH.md`

### 1) 切换环境

- 测试环境 (默认)：`PW_ENV=test` → `https://test-base-platform.insight-aigc.com`
- 正式环境：`PW_ENV=prod` → `https://base-platform.insight-aigc.com`
- 自定义：直接设置 `BASE_URL`（优先级最高）

也支持使用 `.env`：在项目根目录创建 `.env` 写入上述变量；或通过 `ENV_FILE` 指定不同文件（如 `.env.prod`）。

推荐命令：
```bash
# 正式环境跑全量
npm run test:ui:prod

# Open Playwright UI (prod)
npm run ui:prod

# 正式环境跑批量发送（串行）
npm run test:batch:prod
```

### 2) 切换账号

- `PW_USER`: `testUser`(测试环境默认) | `prodUser`(正式环境默认)
- 或使用 `LOGIN_PHONE` + `LOGIN_CODE` 覆盖登录账号（更灵活）

PowerShell 示例：
```powershell
$env:PW_ENV = 'prod'
$env:PW_USER = 'prodUser'
npx playwright test
```

### 3) 强制刷新登录态

当缓存的登录态失效时：
```bash
npm run test:ui:prod:refresh
```

## ⚠️ 注意事项

- **AI 员工模块**：该模块包含动态 DOM 结构，定位时请使用 `AgentPage` 中提供的动态定位方法 (如 `agentItemByName`)。
- **环境配置**：默认 `PW_ENV=test`，切换正式环境用 `PW_ENV=prod` 或直接设置 `BASE_URL`。
