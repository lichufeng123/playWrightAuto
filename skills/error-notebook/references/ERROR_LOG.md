<!-- 典型错误记录。按模板追加，保持简洁。 -->

## 定位不到 chatInput（视频生成员工）
- 现象：进入视频生成类员工后，`getByRole('textbox')` 找不到输入框（模板消失），导致 `waitForChatReady`/`sendMessage` 卡住。
- 原因：输入模板缺失时，页面没有标准 `textbox` 角色。
- 修复：新增输入框兜底定位，回退到 `[contenteditable="true"]` / `textarea` / `input[type="text"]`；在 `waitForChatReady`、`sendMessage`、`selectAgent`、`newChat` 等路径统一使用兜底定位。

## 工作流新建后画布仍处于加载中
- 现象：点击工作流空白卡片后，URL 已跳到 `/canvas/:id`，但画布仍显示“加载中”，直接加节点会失败。
- 原因：`networkidle` 早于画布初始化完成，前端还要继续等待 `canvas/get` 与 `workflow/listNodeSetting` 返回后才会解除 loading。
- 修复：新增 `waitForCanvasReady()`，同时等待 URL 命中 `/canvas/`、`.react-flow` 可见、`加载中` 文案消失，再执行节点与连线操作。

## 节点面板等待条件绑死到 Prompt 输入框
- 现象：图片节点执行正常，但视频节点添加后因为没有 `请输入内容...` 输入框，`node.panel` 的 `waitForReady` 直接超时，导致一致性用例误报失败。
- 原因：把“节点面板可操作”错误等同于“Prompt 输入框可见”，忽略了不同节点面板的结构差异。
- 修复：将节点面板等待拆成 `waitForActionReady()` 与 `waitForPromptReady()`；费用读取和执行按钮只依赖 action 区可见，只有填 Prompt 时才等待输入框。

## 低余额拦截并不等于完全没有 invoke 响应
- 现象：低余额账号点击执行后，前端弹出“赛点余额不足，无法发起任务”，但接口层仍可能返回一次不带 `taskId` 的响应；如果把“命中 invoke”直接当成成功执行，会把拦截场景误判成任务启动。
- 原因：该业务的拦截逻辑不是简单“前端不发请求”，而是“接口响应成功但 `data.taskId` 为空，同时弹窗提示余额不足”。
- 修复：执行结果判断从“是否命中 invoke”升级为“是否拿到有效 `taskId`”；余额不足专项同时校验弹窗文案、余额不变、无新增流水、节点无输出。

## 敏感词失败状态值为 `failure`
- 现象：命中敏感词后，节点并非总是写成 `failed` / `error`，而是会出现 `failure`。
- 原因：后端任务状态枚举与测试初始假设不完全一致。
- 修复：失败状态断言兼容 `failure`；但在 `test` 环境切换为 `即梦 5.0` + 敏感提示词后，任务当前会长时间停留在 `running` 且不触发预扣，因此“失败返还”专项暂以 expected-failure 形式保留，避免把“未进入失败链路”误判成“失败后未返还”。

## 摄影参数弹层会打断节点面板与执行按钮
- 现象：工作流图片节点打开“摄影参数”后，弹层的遮罩会拦截后续点击；如果直接点页面角落，甚至可能从画布页退回项目中心，导致用例误判为节点丢失或执行按钮无响应。
- 原因：摄影参数是独立浮层，不是普通下拉框；关闭手势和节点选中态耦合较重，直接用常规 click 容易误点到导航区域或被遮罩吃掉。
- 修复：为摄影参数单独封装 `open/close/configure` 流程，优先通过遮罩事件关闭浮层；配置完成后在 `Flow` 层重新激活节点面板，再继续读费用和执行，避免把 UI 交互细节泄漏到 spec。

## AI 用例生成问题没有专题沉淀 (2026-04-24)
- 现象：AI 自动生成用例流水线已解决多轮问题，但缺少一份集中记录，后续复盘和交接需要重新翻会话。
- 根因：只有通用错题本，没有针对 PRD 转 XMind、测试点、用例、Review、修订版产物的专题记录规则。
- 修复：新增 `docx/AI自动生成用例问题记录.md`，并更新 `skills/error-notebook/SKILL.md`，要求解决该流水线问题后同步维护专题文档。
- 验证：文档已覆盖当前已解决的 20 类问题；skill 已增加“专题文档同步”规则。
- 关联：ai-testcase, review-cases, revise-cases, xmind, handover

## 人工测试点 XMind 无法直接进入用例生成链路 (2026-04-24)
- 现象：测试人员手写了测试点 XMind，但原流水线只能从 PRD 自动生成测试点，不能直接把人工测试点接到第四步。
- 根因：缺少“人工 XMind -> 04_test_points_reviewed.json”的标准导入命令，后续 `testpoints-to-cases` 只能读取既有 JSON。
- 修复：新增 `import-manual-xmind` 命令，结合 PRD docx 生成 `01_prd_raw.md`，并把人工 XMind 叶子节点导入为 `04_test_points_reviewed.json/xmind`。
- 验证：`python -c` 语法检查通过，临时 XMind 导入可生成 3 条测试点。
- 关联：ai-testcase, manual-xmind, testpoints, prd

## AI 用例生成能力缺少独立交付包 (2026-04-24)
- 现象：AI 用例生成能力散落在主仓库多个目录，直接分享整个仓库会夹带大量无关 Playwright 自动化内容。
- 根因：没有面向外部演示的独立文件夹和项目说明。
- 修复：新增 `ai-testcase-generation-package`，提炼脚本、skills、使用说明、问题记录、示例配置和项目摘要。
- 验证：包内主脚本 AST 语法检查通过，文件结构已检查。
- 关联：ai-testcase, handover, package, docs

## 人工 XMind 导入误用其他需求 PRD (2026-04-28)
- 现象：智能分镜脚本测试点导入时引用了会员订阅付费系统 PRD，后续生成用例上下文跑偏。
- 根因：`import-manual-xmind` 只要求 `--prd` 文件存在，没有检查 PRD、人工 XMind、run-dir 名称是否明显不一致。
- 修复：新增名称匹配防呆校验，默认不允许明显不匹配；确认跨需求复用时必须显式加 `--allow-prd-mismatch`。后续生成、Review、修订步骤也会读取 `run_metadata.json` 校验历史 run-dir。
- 验证：会员订阅 PRD + 智能分镜 XMind + 智能分镜 run-dir 已能触发“疑似选错 PRD”报错；不传 `--prd` 也会报必填参数错误；对已污染 run-dir 执行 `testpoints-to-cases` 也会被拦截。
- 关联：ai-testcase, manual-xmind, prd, guardrail
