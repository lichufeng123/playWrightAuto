---
name: error-notebook
description: Keep a running “错题本” of typical errors, root causes, and fixes; after resolving an issue, append a concise entry, and before coding a similar request, search the log for relevant prior fixes.
---

# 错题本使用指引

## 何时触发
- 处理或修复失败、报错、测试挂、定位不到元素、环境配置等典型问题时。
- 在开始解决类似问题前，先查找历史记录，复用已有经验。

## 记录规范
- 文件：`skills/error-notebook/references/ERROR_LOG.md`
- 追加方式：新增条目到末尾，保持时间顺序。
- 每条记录尽量 5-8 行内，避免冗长。

### 模板
```
## <简短标题> (YYYY-MM-DD)
- 现象：<报错/失败表现>
- 根因：<触发原因，具体到定位/配置/依赖/数据>
- 解决：<关键动作、脚本或修改要点>
- 验证：<运行的用例/命令/截图说明>
- 关联：<关键词标签，方便搜索，例如 playwright, locator, auth, env >
```

## 工作流
1) **查询**：在新任务或报错时，先搜 `ERROR_LOG.md`（标题/关键词/关联标签）。
2) **复用**：若命中相似问题，沿用记录的解决/验证步骤；必要时做最小调整。
3) **记录**：问题解决后按模板追加一条，保持简洁，可加入相关文件/命令路径。

## 注意
- 仅记录复现价值高或容易踩坑的问题；一次性、无代表性的错误不必写。
- 记录命令用反引号，路径用相对路径；不在正文粘贴大段日志。
- 如果新增辅助脚本或诊断命令，可放 `scripts/` 并在此文档引用。
