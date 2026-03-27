# Workflow 用例开发与 Review Playbook

## 1. 新增用例前先判断

- 如果只是换 prompt、clickCount、expectedRemark：
  - 先改 `tests/data/`。
- 如果只是新增一个业务场景：
  - 先找最接近的 spec 复制结构。
- 如果引入了新的页面动作：
  - 优先补 `Page` / `Component`。
- 如果引入了新的结果判断：
  - 优先补 `API` / `Flow`。

## 2. 新增工作流用例的推荐步骤

1. 在 `tests/data/` 补 case。
2. 在对应 `tests/smoke/*.spec.ts` 里接入 case。
3. 只在需要时补 `WorkflowFlow` / `BillingFlow`。
4. 如果要操作新区域，再补 `pages/` 或 `components/`。
5. 如果要查新后端状态，再补 `api/`。
6. 跑最小命令验证。

## 3. Review 时重点看什么

- `Spec` 里是否出现 locator、selector、拖拽细节。
- `Flow` 是否混入大量 selector 或页面细节。
- `Page` 是否开始做业务断言。
- `API` 是否只是取证，还是已经掺入 UI 操作。
- `Utils` 是否写了业务名词导致通用性变差。
- 账务断言是否基于基线快照，而不是“最近一条流水碰运气”。

## 4. 计费断言固定模式

不要自己发明新模式，沿用当前组合：

1. `captureSnapshot()`
2. `runSelectedNode()` 或 `tryRunSelectedNode()`
3. `waitForBalanceDelta()` / `assertBalanceUnchanged()`
4. `waitForFlowRecordsSince()` / `assertNoNewFlowRecordsSince()`

这个模式的意义：

- 快照：记住执行前余额和最新流水 id。
- 差值轮询：确认余额按节点费用变化。
- 新增流水匹配：只看这次执行之后新增的账单。

## 5. 常见坑

### 5.1 节点面板

- 图片节点加完后面板经常已经打开。
- 不要在 spec 里自己重复点节点。
- 复用 `WorkflowFlow.addNode()` 内部的 `nodePanel.isPanelReady()` 逻辑。

### 5.2 运行按钮

- 按钮锁定态通过 class 判断，不要自己猜 loading 时机。
- 重复点击场景优先复用 `runSelectedNode(clickCount)` 或 `tryRunSelectedNode(clickCount)`。

### 5.3 低余额

- 必须使用 `lowBalanceUser`。
- 不能只看弹窗，还要同时校验：
  - `taskId` 为空
  - 余额不变
  - 无新增流水
  - 节点无输出

### 5.4 失败返还

- 当前 case 仅用于锁定环境现状，不要误报成“业务已稳定失败但未返还”。
- 改这个 case 前先确认模型、prompt、环境是否真的能稳定进入失败链路。

## 6. 推荐命令

只做注册检查：

```powershell
node scripts/pw-run.js --env test -- tests/smoke/workflow_billing.spec.ts --list --project=chromium
```

跑单条计费 case：

```powershell
node scripts/pw-run.js --env test -- tests/smoke/workflow_billing.spec.ts -g "计费：单次成功发起即预扣" --project=chromium --workers 1 --reporter=line
```

跑低余额：

```powershell
node scripts/pw-run.js --env test --user lowBalanceUser -- tests/smoke/workflow_low_balance.spec.ts --project=chromium --workers 1 --reporter=line
```

跑失败返还现状：

```powershell
node scripts/pw-run.js --env test -- tests/smoke/workflow_failure.spec.ts -g "异常场景：任务失败后返还赛点" --project=chromium --workers 1 --reporter=line
```
