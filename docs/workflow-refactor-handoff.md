# Workflow 模块重构前置信息

本文档用于下一次新会话开始前的上下文交接。目标不是复述全部历史，而是让新的会话在最短时间内搞清楚：

- 当前 `workflow` 自动化已经做到哪里
- 哪些地方是已知问题
- 哪些设计后面准备推翻重来
- 新会话开始前必须先确认什么

## 1. 当前目标

当前诉求不是继续堆功能，而是准备对 `workflow` 模块自动化做一轮重构。

重构的大方向已经明确：

- 之前的分层和封装偏复杂
- 后续要以“更好理解、更容易维护”为优先
- 新会话里应按用户新的重构指令推进，不默认沿用旧思路继续加层

一句话：

`workflow` 自动化当前重点已经从“继续扩功能”切换为“降复杂度、重新收敛结构”。

## 2. 新会话开始前必须先了解的文件

下个 session 不需要把整个仓库翻一遍，但至少要先看这些文件：

### 业务入口与现状

- [workflow_smoke.spec.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\smoke\workflow_smoke.spec.ts)
- [workflow_failure.spec.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\smoke\workflow_failure.spec.ts)
- [workflow_billing.spec.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\smoke\workflow_billing.spec.ts)
- [workflow_low_balance.spec.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\smoke\workflow_low_balance.spec.ts)

### 数据与场景

- [workflow.data.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\data\workflow.data.ts)
- [workflow.prompts.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\data\workflow.prompts.ts)
- [workflow.billing-cases.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\data\workflow.billing-cases.ts)

### 当前实现主链路

- [workflow.flow.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\flows\workflow.flow.ts)
- [billing.flow.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\flows\billing.flow.ts)
- [workflow.page.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\pages\workflow.page.ts)
- [node.panel.page.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\pages\node.panel.page.ts)
- [canvas.component.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\components\canvas.component.ts)
- [drawer.component.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\components\drawer.component.ts)

### 接口与证据链

- [task.api.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\api\task.api.ts)
- [billing.api.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\api\billing.api.ts)
- [logger.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\utils\logger.ts)
- [report.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\utils\report.ts)

### 设计与历史文档

- [workflow-automation-plan.md](c:\Users\Insight\PycharmProjects\PlayWright_Demo\docs\workflow-automation-plan.md)
- [切换账号.md](c:\Users\Insight\PycharmProjects\PlayWright_Demo\docs\切换账号.md)
- [SKILL.md](c:\Users\Insight\PycharmProjects\PlayWright_Demo\skills\workflow-test-automation\SKILL.md)

## 3. 当前已经实现过的能力

新会话需要知道这些不是空想，而是已经落过代码：

- `workflow` 已有 smoke / billing / failure / low balance 四类专项
- 已支持图片节点主流程自动化
- 已支持计费相关 API 联合校验
- 已支持测试结果截图、JSON 证据、产物图片下载
- `test-results` 目录下已经加了按秒级时间戳的子目录
- 已尝试覆盖模型、分辨率、宽高比、生成张数、摄影参数、组合参数等场景

## 4. 当前最重要的已知问题

这个部分下个 session 必须先知道，不然容易重复踩坑。

### 4.1 工作流页面近期改版

页面近期发生过 UI 变化，已知包括：

- 分辨率和宽高比从两个独立控件，改成了一个合并弹窗
- 图片节点区域和节点面板的交互存在变化
- 节点被选中后，底部/下方参数工具条的结构可能与旧逻辑不一致

这意味着旧的 `NodePanelPage` 逻辑已经不再可靠，尤其是：

- `readResolution`
- `selectResolution`
- `readAspectRatio`
- `selectAspectRatio`
- 节点面板激活与重新聚焦逻辑

### 4.2 当前这轮修复没有彻底完成

最近一次会话已经开始修复“分辨率/宽高比控件合并”问题，但**没有完全收口**。

当前状态是：

- 已确认新控件真实存在，文案类似 `1K · 1:1`
- 已确认点击后会出现统一弹窗，里面同时包含“分辨率”和“宽高比”
- 已尝试修改 `NodePanelPage` 和 `WorkflowFlow`
- 但 `workflow_smoke.spec.ts` 中涉及分辨率/宽高比/组合参数的用例仍未稳定恢复

不要把当前实现当成最终正确状态。

### 4.3 当前问题更像“节点面板重构不匹配”，不是单纯 locator 错一个

已经观察到：

- 节点选中后，节点本体仍处于“初始图片节点内容”状态
- 但底部工具条可能已经是新的参数面板
- 老逻辑里“panel ready”的判定条件、节点重新聚焦方式、参数读取入口都可能不再适用

所以新会话不要只盯着改一两个 selector，而要重新判断：

- 节点配置区到底算不算独立 page/component
- 是否应该简化当前 `WorkflowFlow -> NodePanelPage -> CanvasComponent` 之间的边界

## 5. 当前设计上已经暴露出的痛点

重构前需要明确，为什么要重构。

当前主要痛点：

- `workflow` 分层偏深，理解成本高
- `Flow / Page / Component` 之间边界有些过细
- spec 虽然做到不写 selector，但整体阅读成本仍然偏高
- 节点面板与画布的耦合关系复杂，页面一改动就容易连锁炸
- 某些地方为了稳定性加了较多兜底，导致逻辑显得绕

新会话必须先围绕“要保留什么、要砍什么”来重构，别继续往旧设计上打补丁。

## 6. 新会话开始时建议先确认的决策

进入重构前，建议先和用户确认以下内容：

### 6.1 重构目标优先级

优先确认用户更看重哪一个：

- 降低理解成本
- 减少文件数量
- 降低层级深度
- 让 spec 更直白
- 保留 API 联合校验但压薄实现

### 6.2 哪些能力必须保留

建议先问清楚这些是否必须保留：

- UI + API 联合校验
- 计费专项能力
- 错误截图与 JSON 证据
- 数据驱动
- 低余额 / 失败返还专项

### 6.3 哪些内容可以暂时砍掉

建议明确是否可以先下线或弱化：

- 过细的 `component` 拆分
- 过多的重试/兜底逻辑
- 某些过度封装的 flow
- 非核心场景的 smoke 组合参数覆盖

## 7. 新会话建议的阅读顺序

为了避免上下文再次污染，新会话建议按这个顺序读：

1. [workflow-refactor-handoff.md](c:\Users\Insight\PycharmProjects\PlayWright_Demo\docs\workflow-refactor-handoff.md)
2. [workflow_smoke.spec.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\smoke\workflow_smoke.spec.ts)
3. [workflow.flow.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\flows\workflow.flow.ts)
4. [node.panel.page.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\pages\node.panel.page.ts)
5. [canvas.component.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\components\canvas.component.ts)
6. [workflow.data.ts](c:\Users\Insight\PycharmProjects\PlayWright_Demo\tests\data\workflow.data.ts)
7. 再决定是否继续读 `billing` / `api` / `logger`

不要一上来全仓库横扫，不然又会把重构目标看散。

## 8. 新会话开始前的提醒

新会话里务必记住：

- 当前 `workflow` 模块不是“继续加功能”，而是“准备重构”
- 最近一轮修到一半，尤其是分辨率 / 宽高比这块，不要默认已经稳定
- 先确认用户想保留什么架构，再动代码
- 先收敛复杂度，再谈自愈、AI、录制回放这些花活

一句话收尾：

别再把 `workflow` 自动化往“大而全”方向拱了，下一轮该做的是减法，不是继续堆料。
