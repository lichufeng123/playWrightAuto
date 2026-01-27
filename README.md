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
npx playwright test
```

运行特定测试文件：
```bash
npx playwright test tests/smoke/agent.spec.ts
```

查看测试报告：
```bash
npx playwright show-report
```

## ⚠️ 注意事项

- **AI 员工模块**：该模块包含动态 DOM 结构，定位时请使用 `AgentPage` 中提供的动态定位方法 (如 `agentItemByName`)。
- **环境配置**：默认 Base URL 配置在 `playwright.config.ts` 中，如需切换环境请修改配置文件或通过环境变量注入。
