# AI 测试用例生成流水线使用说明

## 目标

把 PRD 逐步转换为测试点和测试用例，每一步都手动执行，方便测试同学 Review 和调整。

当前流水线包含五个自动化命令，加上一次人工 Review：

```text
prd-to-xmind          PRD docx -> Markdown + 原始 XMind
xmind-to-testpoints  原始 XMind + PRD -> 测试点 JSON + 测试点 XMind
testpoints-to-cases  测试点 + PRD -> 测试用例 JSON/CSV/XLSX
review-cases         PRD + 测试点 + 测试用例 -> Review 报告
revise-cases         Review 报告 + PRD + 测试点 -> 修订版测试用例
```

## 模型配置

不要把 key 写进脚本。建议放在 `.env.local` 或当前 PowerShell 环境变量中。

```powershell
$env:AI_TESTGEN_API_KEY="你的 API Key"
$env:AI_TESTGEN_BASE_URL="http://59.37.128.50:51880/v1"
$env:AI_TESTGEN_MODEL="Qwen/Qwen3.5-397B-A17B-FP8"
```

也可以写入 `.env.local`：

```env
AI_TESTGEN_API_KEY=你的 API Key
AI_TESTGEN_BASE_URL=http://59.37.128.50:51880/v1
AI_TESTGEN_MODEL=Qwen/Qwen3.5-397B-A17B-FP8
```

## 第一步：PRD 转原始 XMind

```powershell
python scripts/ai_testcase_pipeline.py prd-to-xmind --prd "docs/V3.4需求PRD.docx"
```

默认输出目录：

```text
output/ai-testcase-generation/V3.4需求PRD/
```

产物：

```text
01_prd_raw.md
02_prd_mindmap.json
02_prd_mindmap.xmind
run_metadata.json
```

## 第二步：原始 XMind 重构为测试点

```powershell
python scripts/ai_testcase_pipeline.py xmind-to-testpoints --run-dir "output/ai-testcase-generation/V3.4需求PRD"
```

产物：

```text
03_test_points_draft.raw.txt
03_test_points_draft.json
03_test_points_draft.xmind
```

这一步会使用：

```text
skills/prd-xmind-testpoint-refactor/SKILL.md
```

生成测试点时会强制要求每条测试点带上：

```text
modulePath    PRD 标题层级，例如 5.1.5 分享拉新 > 5.1.5.1 个人中心优化分享 > 分享
sourceTitle   当前测试点来源标题，例如 分享
testPoint     从 PRD 需求句拆出来的原子测试点，例如 可分享落地页广告信息
```

测试点 XMind 会按照 `modulePath -> 测试点清单` 生成，测试点只表达“测什么”。

例如 `分享` 下的 PRD 需求：

```text
登录状态下，支持对点击分享落地页的广告信息，同步到手机移动端（需手机端适配显示）；
分享步骤：点击[邀请用户]，跳转分享页面，支持在本页面复制个人邀请码/邀请链接，成功后显示“已成功复制链接”；
```

会被精炼成类似：

```text
分享
├── 1. 可分享落地页广告信息
├── 2. 广告信息可同步到手机端
├── 3. 手机端适配展示
├── 4. 点击【邀请用户】跳转分享页面
├── 5. 支持复制个人邀请码
├── 6. 支持复制邀请链接
└── 7. 复制成功后显示“已成功复制链接”
```

第二步不会生成测试用例，也不会在 XMind 中展示 `前提条件`、`测试步骤`、`预期结果` 这类用例字段。

## 第三步：人工 Review 测试点

打开 `03_test_points_draft.xmind` 或 `03_test_points_draft.json` 人工检查。

如果需要调整，建议另存为：

```text
04_test_points_reviewed.json
04_test_points_reviewed.xmind
```

后续生成用例时，脚本会优先读取 `04_test_points_reviewed.json`；如果没有这个文件，则自动使用 `03_test_points_draft.json`。

## 第四步：生成测试用例

```powershell
python scripts/ai_testcase_pipeline.py testpoints-to-cases --run-dir "output/ai-testcase-generation/V3.4需求PRD"
```

这一步会以 `03_test_points_draft.json` 或人工修订后的 `04_test_points_reviewed.json` 为主输入，结合 `01_prd_raw.md` 生成用例。

生成规则：

```text
1 个测试点 -> 至少 1 条测试用例
禁止把多个测试点合并成 1 条用例
脚本会校验每个测试点是否都有对应测试用例
如果模型漏生成，脚本会直接报错，不会继续输出缩水版 Excel
```

为了避免模型一次吃太多内容后偷懒合并，脚本会自动把测试点分批生成，每批最多 8 个测试点。

产物：

```text
05_test_cases.raw.txt
05_test_cases.json
05_test_cases.csv
05_test_cases.xlsx
```

测试用例表格字段固定为：

```text
【测试模块】【用例标题】【前提条件】【测试步骤】【预期结果】【实际结果】【状态】【备注】
```

其中 `实际结果`、`状态`、`备注` 默认留空，供人工执行或后续维护时填写。

## 第五步：Review 测试用例

```powershell
python scripts/ai_testcase_pipeline.py review-cases --run-dir "output/ai-testcase-generation/V3.4需求PRD"
```

产物：

```text
06_test_case_review.md
```

这一步会使用：

```text
skills/testcase-reviewer/SKILL.md
```

## 第六步：结合 Review 重新生成测试用例

```powershell
python scripts/ai_testcase_pipeline.py revise-cases --run-dir "output/ai-testcase-generation/V3.4需求PRD"
```

这一步会读取：

```text
01_prd_raw.md
03_test_points_draft.json 或 04_test_points_reviewed.json
06_test_case_review.md
```

生成修订版测试用例：

```text
07_test_cases_revised.raw.txt
07_test_cases_revised.json
07_test_cases_revised.csv
07_test_cases_revised.xlsx
```

第六步不会覆盖第四步的 `05_test_cases.*`，方便对比 Review 前后的用例差异。

修订版仍然执行覆盖校验：

```text
1 个测试点 -> 1 条测试用例
如果漏掉测试点，脚本直接报错
```

第六步还会额外读取 `06_test_case_review.md` 中明确指出的遗漏场景，生成补充用例。例如：

```text
链接过期
老用户点击分享链接
复制失败
手机号已注册
```

这些补充用例在内部会标记为 `REVIEW-001`、`REVIEW-002`，导出的 Excel 仍然只保留标准 8 列。

补充用例的 `备注` 必须写清楚为什么补充，不能只写“补充来源：Review 报告 严重问题 3”。推荐格式：

```text
补充来源：Review 报告 严重问题 3：缺少关键异常场景（链接过期），PRD 提到支持“有效期配置”（TP-021），但测试用例中没有任何一条验证“链接过期后点击”的场景。
```

如果模型生成的补充用例备注过短或过于笼统，脚本会直接报错，避免把原因不清楚的补充用例写进表格。

## 常见问题

- 如果只想重新生成测试点，重新执行第二步即可。
- 如果人工改了测试点，保存为 `04_test_points_reviewed.json`，再执行第四步。
- 如果只改了用例，直接执行第五步 Review。
- 如果 Review 后需要按建议修订用例，执行第六步。
- 如果模型返回的 JSON 格式坏了，先看终端报错，再降低一次输入长度或让 AI 重新生成。
- 如果 PRD 内容很大，建议先拆模块执行，不要一口气塞给模型，别把模型当东北铁锅炖，啥都往里扔。
