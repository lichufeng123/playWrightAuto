import { expect, Locator, Page } from '@playwright/test';
import { waitForVisible } from '../utils/wait';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 分组式弹层组件，主要用于新版“分辨率 / 宽高比”这种合并面板。
 *
 * 这个组件的职责只有一个：
 * 已经拿到某个“面板根节点”后，在这个面板里按“分组标题 + 选项文本”去点具体选项。
 *
 * 这里故意不把“面板根节点怎么找”写死在组件内部，而是由调用方通过 rootLocator 传进来。
 * 这样同一个组件就能复用在不同页面、不同弹层结构里。
 */
export class SectionPanelComponent {
  constructor(
    private readonly page: Page,
    // 这里传入的不是“某个固定的 Locator”，而是“一个返回 Locator 的函数”。
    // 原因是很多弹层只有在点击后才会真正挂到 DOM 上，如果构造时就把元素写死，
    // 后面页面重渲染后可能拿到的是过期引用。每次临用时现取一遍会更稳。
    private readonly rootLocator: () => Locator,
  ) {}

  /**
   * 取到这个组件当前对应的“根节点定位器”。
   *
   * 你问的这段语法：
   * `locator(): Locator { ... }`
   * 其实只是 TypeScript 的“类方法声明”。
   *
   * 含义拆开看就是：
   * - `locator()`：定义一个名字叫 locator 的方法
   * - `: Locator`：这个方法返回的类型是 Playwright 的 Locator
   * - `return this.rootLocator()`：真正返回值来自构造函数里注入的那个函数
   *
   * 所以它不是啥神秘语法，就是“封装了一层统一入口”，方便后面所有方法都通过 this.locator()
   * 去拿当前面板根节点。
   */
  locator(): Locator {
    return this.rootLocator();
  }

  /**
   * 判断这个面板当前是否可见。
   *
   * 这里不需要额外传参，是因为“要判断哪个元素”在构造函数里就已经约定好了，
   * 就是 `rootLocator()` 返回的那个根节点。
   *
   * 调用链是这样的：
   * - `this.locator()`：拿到面板根节点
   * - `.isVisible()`：判断它是否可见
   * - `.catch(() => false)`：如果元素暂时不存在，别抛错，直接当作不可见处理
   */
  async isVisible(): Promise<boolean> {
    return await this.locator().isVisible().catch(() => false);
  }

  /**
   * 等待这个面板真正出现在页面上。
   *
   * 常见场景是：
   * - 先点某个下拉触发器
   * - 页面再异步把弹层渲染出来
   *
   * 这里本质上是在等“根节点变成可见”。
   */
  async waitForVisible(timeoutMs = 15_000): Promise<void> {
    await waitForVisible(this.locator(), timeoutMs);
  }

  /**
   * 在某个分组里点击指定选项。
   *
   * 例子：
   * - sectionTitle = '分辨率'
   * - optionText = '1K'
   *
   * 这时候它会优先去“分辨率”这组下面找 `1K`，
   * 如果页面结构变化、分组容器没那么规整，再退回到整个面板里兜底查找。
   */
  async selectOption(sectionTitle: string, optionText: string, timeoutMs = 15_000): Promise<void> {
    await this.waitForVisible(timeoutMs);

    // panelRoot 就是“整个弹层面板”的根节点。
    // 比如那个同时包含“分辨率”和“宽高比”的大弹层容器。
    const panelRoot = this.locator();

    // searchScopes 表示“允许搜索选项的范围列表”。
    // 为什么要做成数组？
    // 因为我们想按优先级逐层尝试，而不是上来就在整个面板里乱找。
    const searchScopes = [
      // 第一优先级：
      // 先缩小到“包含 sectionTitle 标题的那一块分组容器”里查找。
      // 这样如果面板里不同分组都有同名选项，就不容易点错。
      panelRoot.locator('div, section, article').filter({
        has: panelRoot.getByText(sectionTitle, { exact: true }),
      }),
      // 第二优先级：
      // 如果页面改版导致找不到明确分组，就退回整个面板做兜底搜索。
      panelRoot,
    ];

    for (const searchScope of searchScopes) {
      const option = await this.findOption(searchScope, optionText, timeoutMs).catch(() => null);
      if (!option) {
        continue;
      }

      await option.click({ force: true });
      return;
    }

    throw new Error(`未在 ${sectionTitle} 分组中找到选项: ${optionText}`);
  }

  async close(timeoutMs = 5_000): Promise<void> {
    if (!(await this.isVisible())) {
      return;
    }

    // 这类弹层大多数都支持 Escape 关闭，所以这里统一用键盘关闭，
    // 避免为了每一种面板单独找“关闭按钮”。
    await this.page.keyboard.press('Escape').catch(() => undefined);
    // 不是按完键就算结束，而是继续轮询到面板真的消失。
    await expect
      .poll(async () => await this.isVisible(), {
        timeout: timeoutMs,
        intervals: [300, 500, 1_000],
      })
      .toBeFalsy();
  }

  /**
   * 生成“可能命中目标选项”的一组候选定位器。
   *
   * 参数说明：
   * - scope：这次允许搜索的范围，例如某个分组容器，或者整个面板
   * - optionText：目标选项文案，例如 `1K`、`16:9`
   *
   * 返回值是一个 Locator 数组，不是立即查找结果。
   * 后面会按顺序探测哪个候选真的存在。
   */
  private optionCandidates(scope: Locator, optionText: string): Locator[] {
    const optionTextPattern = new RegExp(escapeRegex(optionText), 'i');
    return [
      scope.getByRole('option', { name: optionTextPattern }).first(),
      scope.getByRole('button', { name: optionTextPattern }).first(),
      scope.getByText(optionText, { exact: true }).first(),
      scope.locator('[role="option"], button, [class*="cursor-pointer"], label, div')
        .filter({ hasText: optionTextPattern })
        .first(),
    ];
  }
 
  private async findOption(
    scope: Locator,
    optionText: string,
    timeoutMs: number,
  ): Promise<Locator> {
    // 同一个 UI 选项有时会被实现成 option，有时是 button，甚至只是个可点击 div，
    // 所以这里先准备好多种候选定位方式，再按顺序探测哪个真的存在。
    const candidates = this.optionCandidates(scope, optionText);

    // 先等待“至少有一个候选元素存在”，避免页面还没渲染完就直接报错。
    await expect
      .poll(async () => {
        for (let index = 0; index < candidates.length; index += 1) {
          if (await this.exists(candidates[index])) {
            return index + 1;
          }
        }
        return 0;
      }, {
        timeout: timeoutMs,
        intervals: [300, 500, 1_000],
      })
      .toBeGreaterThan(0);

    // 真正返回第一个能用的候选定位器，后面的调用者再去 click。
    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    throw new Error(`未找到面板选项: ${optionText}`);
  }

  /**
   * 判断某个 Locator 当前有没有命中元素。
   *
   * 这里故意不用 isVisible，因为有些选项已经挂到 DOM 里了，只是还没完全可见，
   * 对“能不能继续往下等待 / 探测”来说，先知道它存不存在更重要。
   */
  private async exists(locator: Locator): Promise<boolean> {
    return (await locator.count().catch(() => 0)) > 0;
  }
}
