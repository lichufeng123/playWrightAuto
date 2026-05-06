# AI 自动生成用例问题记录

更新时间：2026-04-24

本文记录 AI 测试用例生成流水线建设过程中，已提出的问题、暴露的困难、定位结论和最终解决方式。后续继续优化该流水线时，遇到新问题并解决后，应追加到本文末尾。

## 当前流水线

当前按手动分步执行设计，不做一键全自动，方便测试人员中途 Review 和调整：

1. `prd-to-xmind`：根据 PRD docx 生成 `01_prd_raw.md`、`02_prd_mindmap.json`、`02_prd_mindmap.xmind`。
2. `xmind-to-testpoints`：结合 PRD 和原始 XMind，将需求精炼成原子测试点，输出 `03_test_points_draft.json/xmind`。
3. 人工 Review 测试点：必要时保存为 `04_test_points_reviewed.json`；如果需求不适合 AI 解析，也可以通过 `import-manual-xmind` 从人工测试点 XMind 直接生成 `04_test_points_reviewed.json`。
4. `testpoints-to-cases`：结合测试点和 PRD 生成测试用例，输出 `05_test_cases.json/csv/xlsx`。
5. `review-cases`：结合 PRD、测试点和用例生成 Review 报告，输出 `06_test_case_review.md`。
6. `revise-cases`：结合 Review 报告、PRD 和测试点重新生成修订版用例，输出 `07_test_cases_revised.*` 和 `08_revision_summary.md`。

## 已解决问题

### 1. 一键执行开关没有必要

- 问题：最初方案里有“开启则跳过 Review，关闭则进入 Review”的开关。
- 判断：用户希望每一步手动执行命令，而不是一次性跑完全流程，所以这个开关反而增加理解成本。
- 解决：移除开关思路，改成明确的分步命令，每一步都能单独执行和检查产物。

### 2. 需要从 PRD docx 生成 XMind

- 问题：需要把 `docs/V3.4需求PRD.docx` 转成思维导图形式，作为后续测试点提取基础。
- 难点：docx 内有标题、段落、表格，不能简单按纯文本处理。
- 解决：在 `scripts/ai_testcase_pipeline.py` 中实现 `prd-to-xmind`，提取 docx 段落和表格，生成 Markdown、XMind JSON 和 XMind 文件。

### 3. XMind 标题和测试点缺少关联

- 问题：生成的 XMind 曾出现“标题也写进测试点”“模块和测试点之间没有关联”的情况。
- 根因：测试点生成时没有强制保留 PRD 标题层级，模型容易把标题和需求混在一起。
- 解决：更新 `skills/prd-xmind-testpoint-refactor/SKILL.md`，要求每条测试点必须带 `modulePath`、`sourceTitle`、`testPoint`、`source`。
- 效果：后续测试点可以追溯到 PRD 标题路径，例如 `会员订阅付费系统/套餐定制留资/留资资料`。

### 4. 第三步误生成“测试用例”而不是“测试点”

- 问题：`03_test_points_draft.xmind` 曾经被生成成类似测试用例的结构，包含前提条件、测试步骤、预期结果。
- 根因：提示词对“测试点”和“测试用例”的边界约束不够硬。
- 解决：明确第二步只做原子测试点，不允许输出前提条件、测试步骤、预期结果、实际结果、状态。
- 标准：测试点只回答“测什么”，测试用例才回答“怎么测、预期是什么”。

### 5. 标题编号污染展示

- 问题：XMind 中出现 `标题：5.1.5.1 个人中心优化分享`、`标题：分享` 这类前缀和编号。
- 根因：直接使用 PRD 标题原文展示，没有做标题清洗。
- 解决：增加 `display_path_title()`，去掉 `5.1.5.1` 这类章节编号和不必要前缀。
- 效果：展示更接近真实业务模块名称。

### 6. 测试用例数量太少

- 问题：执行 `testpoints-to-cases` 后，生成的测试用例比第三步测试点少很多。
- 根因：模型一次性吃太多上下文后会偷懒合并；同时早期逻辑更偏向 PRD 原文，没有强制“一条测试点生成一条用例”。
- 解决：按测试点分批生成，每批最多 8 个测试点；强制 `1 个测试点 -> 1 条测试用例`；生成后执行覆盖校验。
- 效果：如果模型漏生成某些测试点，脚本直接报错，不输出缩水版 Excel。

### 7. 分批机制需要解释清楚

- 问题：用户问“你是怎么个分批的？是不是把 `02_prd_mindmap.json` 截成四批喂过去？”
- 解释：不是按 PRD 原始 XMind 分批，而是按 `03_test_points_draft.json` 中的测试点列表分批。
- 当前规则：每批最多 8 个测试点；每批都带完整 PRD Markdown 和本批测试点 JSON。
- 产物：保存 `05_test_cases.batch_01.raw.txt`、`05_test_cases.batch_02.raw.txt` 等，方便排查。

### 8. 测试用例表头需要固定

- 问题：生成测试用例需要按固定模板输出。
- 要求：`【测试模块】【用例标题】【前提条件】【测试步骤】【预期结果】【实际结果】【状态】【备注】`，后三列留空。
- 解决：统一 `cases_to_rows()`，CSV/XLSX 都只导出这 8 列。

### 9. Review 后需要重新生成用例

- 问题：第五步 Review 后，需要第六步结合 Review 报告、PRD、测试点重新生成用例。
- 解决：新增 `revise-cases`，输出 `07_test_cases_revised.json/csv/xlsx/raw.txt`。
- 补充：新增 `08_revision_summary.md`，总结哪些修改了、哪些新增了、哪些仍需人工确认。

### 10. 修订版没有充分参考 Review 报告

- 问题：Review 报告提到“缺少链接过期、老用户点击分享链接”等场景，但 `07_test_cases_revised.xlsx` 没补上。
- 根因：只让模型“重写原有测试点对应的用例”，Review 中额外遗漏场景没有独立补充机制。
- 解决：增加 `generate_review_supplement_cases()`，专门把 Review 中明确指出的遗漏场景生成 `REVIEW-xxx` 补充用例。
- 效果：原测试点对应用例和 Review 补充用例分开处理，避免漏补。

### 11. 补充用例备注过于笼统

- 问题：备注只写“补充来源：Review 报告 严重问题 3”，看不出为什么补。
- 要求：备注必须写清问题位置、问题标题、原因摘要。
- 解决：增加 `validate_supplement_remark()`，备注过短或过泛直接报错。
- 推荐格式：`补充来源：Review 报告 严重问题 3：缺少关键异常场景（链接过期），PRD 提到支持“有效期配置”（TP-021），但测试用例中没有任何一条验证“链接过期后点击”的场景。`

### 12. PRD 输入目录需要迁移

- 问题：`docs` 目录放了很多不相关文件，用户希望单独建 `prd` 目录。
- 解决：脚本支持通过 `--prd` 指定 PRD 文件路径，通过 `--run-dir` 指定输出目录。
- 示例：`python scripts/ai_testcase_pipeline.py prd-to-xmind --prd "prd/V3.4/V3.4需求PRD.docx" --run-dir "output/ai-testcase-generation/V3.4需求PRD-会员订阅付费系统"`。

### 13. AI 返回 JSON 解析失败

- 问题：执行 `testpoints-to-cases` 报 `Expecting ',' delimiter`。
- 根因：模型输出的 JSON 偶发不合法，例如缺逗号、未转义双引号、尾逗号。
- 解决：每批 raw 返回先落盘，再解析；解析失败时先本地修复常见尾逗号，再调用模型做 JSON 修复，修复结果保存为 `*.repaired.txt`。
- 效果：出错时能定位到具体批次和 raw 文件，不再只给一个抽象报错。

### 14. 某批 JSON 解析失败时 raw 没落盘

- 问题：如果解析失败发生得早，用户拿不到原始模型返回，无法判断模型到底输出了什么。
- 根因：早期流程是“先解析，后写文件”。
- 解决：调整为“先写 `batch_xx.raw.txt`，再解析”。

### 15. Review 报告需要人工审核意见列

- 问题：Review 报告中某些建议需要人工判断是否修改、忽略或暂定。
- 解决：要求严重问题、覆盖遗漏、PRD 不一致、不可执行、重复、自动化建议等表格都包含 `审核意见` 列。
- 规则：默认 `待人工审核`，用户可改为 `修改`、`忽略`、`已处理`、`暂定`、`需产品确认`。

### 16. 不需要优先级调整建议

- 问题：Review 报告中出现 `优先级调整建议`，但用例模板没有优先级字段。
- 解决：更新 `skills/testcase-reviewer/SKILL.md` 和 Review 提示词，禁止输出优先级章节。

### 17. “暂定/需产品确认”需要特殊处理

- 问题：审核意见为暂定时，不能让 AI 编造产品规则。
- 解决：`revise-cases` 读取审核意见；遇到 `暂定` 或 `需产品确认` 时，不强行补规则，而是在相关用例备注中写清问题说明和待确认原因。
- 示例备注：`审核意见：暂定；问题说明：PRD 中“最大级别权益”定义模糊，需产品确认权益叠加规则。`

### 18. 同一个 Review 问题重复出现在不同章节

- 问题：例如同一条用例既出现在“不可执行/预期不可判断”，又出现在“PRD 不一致或疑似编造”。
- 根因：模型 Review 时按章节独立思考，缺少跨章节去重。
- 解决：新增 `normalize_review_report()`，对原始 Review 报告进行二次整理：去重、合并同核心问题、保留更贴近根因的章节。
- 产物：原始报告保存为 `06_test_case_review.raw.md`，整理后报告保存为 `06_test_case_review.md`。

### 19. Review 新增用例模块分类错误

- 问题：`07_test_cases_revised.xlsx` 中新增用例的测试模块写成 `5.1.6.1 套餐定制留资/留资资料`，没有归到 `会员订阅付费系统/套餐定制留资/留资资料`。
- 根因：Review 补充用例来自 PRD 标题，没走测试点 `modulePath` 的分类口径。
- 解决：增加 `normalize_case_modules()`，基于测试点已知模块路径归一化所有用例模块；如果模型只返回二级模块，也会补齐根模块。
- 效果：新增用例和原有用例使用同一套分类。

### 20. Review 新增用例需要高亮

- 问题：Excel 中看不出哪些是 Review 后新增的用例。
- 解决：写 XLSX 时给 `_source_test_point_id` 以 `REVIEW-` 开头的行加浅黄色高亮。
- 注意：如果 Excel 正打开，Windows 会阻止覆盖原文件，需要先关闭文件再重新生成。

### 21. 人工测试点 XMind 需要接入后续生成链路

- 问题：部分需求不适合由 AI 从 PRD 自动解析成 XMind/测试点，用户会手动写好测试点 XMind，希望直接进入“生成用例 -> Review 用例 -> 修订用例”链路。
- 根因：原流程只有 `prd-to-xmind` 和 `xmind-to-testpoints`，缺少“人工 XMind 测试点 -> 标准 04_test_points_reviewed.json”的入口。
- 解决：新增 `import-manual-xmind` 命令，输入 PRD docx 和人工测试点 XMind，输出 `01_prd_raw.md`、`04_test_points_reviewed.json`、`04_test_points_reviewed.xmind`。
- 规则：人工 XMind 的叶子节点视为测试点，上级节点路径视为 `modulePath`；如果根节点是“测试点总览/测试点清单/人工测试点”，只作为容器不进入模块路径。
- 后续：导入完成后继续执行 `testpoints-to-cases`、`review-cases`、`revise-cases`。

### 22. AI 用例生成能力需要提炼成交付包

- 问题：完整 Playwright 自动化仓库内容太多，直接给朋友看会被无关目录干扰，不利于理解 AI 用例生成项目本身。
- 根因：AI 用例生成能力散落在 `scripts`、`skills`、`docs`、`docx` 等目录中，没有独立项目视角的说明和入口。
- 解决：新增 `ai-testcase-generation-package` 文件夹，只提炼 AI 用例生成相关内容，包括主脚本、提示词 skill、使用说明、问题记录、环境变量示例、人工 XMind 规范和项目摘要。
- 验证：包内 `scripts/ai_testcase_pipeline.py` 已通过 Python AST 语法检查。
- 后续：对外展示或分享时，优先打包 `ai-testcase-generation-package`，不要直接打包整个 Playwright 仓库。

### 23. 人工 XMind 导入时可能复制错 PRD

- 问题：智能分镜脚本只有人工测试点 XMind，没有对应 PRD，但导入时误用了会员订阅付费系统 PRD，导致后续用例生成引用了错误 PRD 上下文。
- 根因：`import-manual-xmind` 虽然强制要求 `--prd`，但早期只校验文件存在，没有校验 PRD、人工 XMind、输出目录是否明显属于同一个需求。
- 解决：新增名称匹配防呆校验。默认情况下，PRD 文件名、人工 XMind 文件名、run-dir 名称明显不匹配时直接报错；只有显式增加 `--allow-prd-mismatch` 才允许跨需求复用。后续 `testpoints-to-cases`、`review-cases`、`revise-cases` 也会读取 `run_metadata.json` 做同样校验，避免继续吃历史残留的错误 PRD。
- 验证：使用 `V3.4需求PRD-会员订阅付费系统.docx` + `智能分镜脚本测试点.xmind` + `V3.4需求PRD-智能分镜脚本` 已能触发“疑似选错 PRD”错误；不传 `--prd` 也会被命令行参数校验拦截；直接对已污染 run-dir 执行 `testpoints-to-cases` 也会被拦截。
- 后续：没有 PRD 的需求不要随便拿其他 PRD 顶上，应先补需求文档，或明确提供适配该需求的 PRD/说明文档。

## 当前关键文件

- 流水线脚本：`scripts/ai_testcase_pipeline.py`
- PRD 测试点重构 skill：`skills/prd-xmind-testpoint-refactor/SKILL.md`
- 测试用例 Review skill：`skills/testcase-reviewer/SKILL.md`
- 使用说明：`docs/AI测试用例生成流水线使用说明.md`
- 问题沉淀：`docx/AI自动生成用例问题记录.md`

## 后续记录规则

后续继续做 AI 自动生成用例时，遇到并解决以下情况，应追加记录：

- 模型输出结构不稳定。
- 测试点和 PRD 层级不一致。
- 用例数量缩水、漏测、重复。
- Review 建议无法落到用例。
- Excel/CSV/JSON 产物不符合测试人员使用习惯。
- 人工 Review 发现规则需要调整。
- 新增命令、参数、产物或执行流程变化。

追加格式：

```text
### <序号>. <问题标题>

- 问题：...
- 根因：...
- 解决：...
- 验证：...
- 影响文件：...
```
