<!-- 典型错误记录。按模板追加，保持简洁。 -->

## 定位不到 chatInput（视频生成员工）
- 现象：进入视频生成类员工后，`getByRole('textbox')` 找不到输入框（模板消失），导致 `waitForChatReady`/`sendMessage` 卡住。
- 原因：输入模板缺失时，页面没有标准 `textbox` 角色。
- 修复：新增输入框兜底定位，回退到 `[contenteditable="true"]` / `textarea` / `input[type="text"]`；在 `waitForChatReady`、`sendMessage`、`selectAgent`、`newChat` 等路径统一使用兜底定位。

## 工作流新建后画布仍处于加载中
- 现象：点击工作流空白卡片后，URL 已跳到 `/canvas/:id`，但画布仍显示“加载中”，直接加节点会失败。
- 原因：`networkidle` 早于画布初始化完成，前端还要继续等待 `canvas/get` 与 `workflow/listNodeSetting` 返回后才会解除 loading。
- 修复：新增 `waitForCanvasReady()`，同时等待 URL 命中 `/canvas/`、`.react-flow` 可见、`加载中` 文案消失，再执行节点与连线操作。
