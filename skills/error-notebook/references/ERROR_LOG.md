<!-- 典型错误记录。按模板追加，保持简洁。 -->

## 定位不到 chatInput（视频生成员工）
- 现象：进入视频生成类员工后，`getByRole('textbox')` 找不到输入框（模板消失），导致 `waitForChatReady`/`sendMessage` 卡住。
- 原因：输入模板缺失时，页面没有标准 `textbox` 角色。
- 修复：新增输入框兜底定位，回退到 `[contenteditable="true"]` / `textarea` / `input[type="text"]`；在 `waitForChatReady`、`sendMessage`、`selectAgent`、`newChat` 等路径统一使用兜底定位。
