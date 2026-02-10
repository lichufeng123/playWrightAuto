# Env & Auth Switching (Implementation Notes)
#
# This file starts with ASCII on purpose to avoid a known Windows patch encoding edge-case.

## UI mode quick answer

- `npx playwright test --ui` uses the same environment resolution as normal runs (`playwright.config.ts`).
- Default environment is `test` because `PW_ENV` defaults to `test` when unset.
- UI 运行期间不会“动态切环境/切账号”；想切的话，关掉 UI 进程后用新的环境变量重新启动。
- Switch environment via env vars (or `.env` / `ENV_FILE`):
  - PowerShell: `$env:PW_ENV='prod'; $env:PW_USER='prodUser'; npx playwright test --ui`
  - Wrapper: `node scripts/pw-run.js --env prod --user prodUser -- --ui`
- npm scripts (same effect):
  - `npm run ui:test`
  - `npm run ui:prod`
# 中文说明从下方开始。

## 0. 这份文档讲什么？

解释项目里这几件事是怎么做到的（对应到具体代码文件），让你后续自己也能维护：

- 环境默认账号更顺滑（测试/正式自动选账号）
- 登录态不再混用（按“环境 + 账号”隔离 storageState）
- 全流程入口统一（用脚本跑，不用手动记一堆 `$env:...`）
- 临时换号（不改代码也能换登录手机号/验证码）
- 为什么 `auth/state.json` 现在“不再被使用”

## 1. 之前的坑是什么？

Playwright 通常会用 `storageState`（登录态文件）复用登录状态，避免每条用例都重新登录。

你之前的实现里有两个点会造成“切环境不生效/登录态串了”：

1) `playwright.config.ts` 里 `baseURL` 可以切换，但 `auth/global-setup.ts` 里登录页是写死跳到测试环境域名。
2) 登录态固定写到 `auth/state.json`，导致你切到正式环境后仍可能复用“测试环境的 cookie/localStorage”。

## 2. 现在的总体方案（一句话）

把“**环境**、**账号**、**登录态文件路径**”统一收敛到 Playwright 配置里，然后让 `globalSetup` 从配置里读取并写回同一个路径。

## 3. `playwright.config.ts` 做了什么？

文件：`playwright.config.ts`

### 3.1 环境如何决定（baseURL）

`baseURL` 的优先级：

1. `BASE_URL`（你手动指定的绝对地址）
2. `PW_ENV` 映射：
   - `PW_ENV=test` → `https://test-base-platform.insight-aigc.com`
   - `PW_ENV=prod` → `https://base-platform.insight-aigc.com`
3. 默认不写 `PW_ENV` 时：按 `test` 处理

另外支持 `.env`：

- 默认读取仓库根目录的 `.env`
- 也可以用 `ENV_FILE` 指定，比如 `.env.prod`

### 3.2 默认账号为什么“更顺滑”

`PW_USER` 你可以不填。

不填时，会根据 `baseURL` 自动选默认账号：

- host 以 `test-` 开头 → `testUser`
- 否则 → `prodUser`

同时为了兼容你老的习惯（避免你脚本突然跑不起来），也支持别名：

- `vipUser` → `testUser`
- `normalUser` → `prodUser`

### 3.3 登录态为什么“不再混用”

关键点是：`storageState` 不再固定写 `auth/state.json`，而是按“环境 + 账号”生成路径：

默认路径：

`playwright/.auth/state.<host>.<user>.json`

例子：

- `playwright/.auth/state.test-base-platform.insight-aigc.com.testUser.json`
- `playwright/.auth/state.base-platform.insight-aigc.com.prodUser.json`

所以你切到正式环境时，会自动用另一个 state 文件；不会再把测试环境的 token/cookie 带过去。

## 4. `auth/global-setup.ts` 做了什么？

文件：`auth/global-setup.ts`

核心逻辑：

1) 通过 `globalSetup(config)` 读到 Playwright 配置（**不是写死域名**）：

- `baseURL`：从 `config.projects[0].use.baseURL` 读
- `storageStatePath`：从 `config.projects[0].use.storageState` 读

2) 如果 `storageStatePath` 已经存在，默认复用（跳过登录）：

- 想强制重登：设置 `PW_REFRESH_STATE=1`

3) 登录时使用 `context = browser.newContext({ baseURL })`，并且 `loginPage.open()` 走 `/login`：

- 这一步把“登录去哪儿”完全交给 `baseURL`，从根上修复“globalSetup 写死测试域名”的坑

4) 登录成功后写入同一个 `storageStatePath`：

- `await context.storageState({ path: storageStatePath })`

## 5. `scripts/pw-run.js` 是干嘛的？

文件：`scripts/pw-run.js`

它就是一个“参数 → 环境变量 → 调 Playwright”的薄封装，目的：

- 你不用记 PowerShell 里 `$env:PW_ENV='prod'` 这种写法
- CI/本地都用同一套命令风格

支持的参数：

- `--env test|prod` → 设置 `PW_ENV`
- `--user testUser|prodUser` → 设置 `PW_USER`
- `--refresh` → 设置 `PW_REFRESH_STATE=1`
- `--phone`/`--code` → 设置 `LOGIN_PHONE`/`LOGIN_CODE`（临时换号）
- `--` 之后的内容原样透传给 `playwright test`

并且它用 Node 直接跑 `@playwright/test/cli`，避免 Windows 上 `npx` shim 的坑。

## 6. 我日常应该怎么用？

### 6.1 正式环境跑全量

```bash
npm run test:ui:prod
```

### 6.2 测试环境跑全量

```bash
npm run test:ui:test
```

### 6.3 正式环境批量发送（串行）

```bash
npm run test:batch:prod
```

### 6.4 登录态失效时强制重登

```bash
npm run test:ui:prod:refresh
```

### 6.5 临时换手机号/验证码（不改代码）

```bash
node scripts/pw-run.js --env prod --phone 132xxxx --code 1234 -- --project=chromium
```

## 7. 为什么说 `auth/state.json` “不再被使用”？

因为现在 `playwright.config.ts` 的 `use.storageState` 已经指向 `playwright/.auth/state.<host>.<user>.json`。

所以：

- `auth/state.json` 存在与否不会影响测试（除非你把配置改回去）
- 它一般含 token/localStorage，建议不要提交到 git

如果你希望彻底清掉这个历史包袱，我可以再帮你做：

- 把 `auth/state.json` 从 git 里移除（不删你本地文件）
- `.gitignore` 加上 `auth/state.json`

## 8. 你需要懂的最少 TypeScript（看得懂即可）

这次改造里涉及到的 TypeScript 语法其实不多，理解下面 4 个点就够了：

1) `type FullConfig`：这是 Playwright Test 提供的配置类型。`globalSetup(config: FullConfig)` 里拿到的 `config` 就是它。

2) `process.env.XYZ`：读取环境变量。比如 `process.env.PW_ENV`、`process.env.PW_USER`。

3) `||`（或运算）做默认值：`process.env.PW_ENV || 'test'` 表示“如果没设置，就用 `test`”。

4) `as` / `keyof` 这类写法：主要用于“把字符串当成对象 key 去取值”时让 TS 不报错；它不影响运行时逻辑，你可以把它理解成“类型提示”。
