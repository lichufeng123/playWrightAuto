import { expect, Locator, Page } from '@playwright/test';
import { waitForVisible } from '../utils/wait';

function normalizeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface SelectFieldComponentOptions {
  // 某些下拉控件会把选项渲染到独立弹层里，不能直接在 body 全局找。
  popupLocator?: () => Locator;
}

/**
 * 工作流参数区的通用下拉组件。
 * triggerSource 允许传入多个候选触发器，用来兜住 UI 改版后 button / combobox 互换的情况。
 *
 * 这个组件解决的是这类问题：
 * - 同一个字段在不同版本里长得不一样
 * - 打开下拉后，选项可能出现在独立弹层里
 * - 选项的 DOM 标签并不统一
 */
export class SelectFieldComponent {
  constructor(
    private readonly page: Page,
    private readonly triggerSource: () => Locator | Locator[],
    private readonly options?: SelectFieldComponentOptions,
  ) {}

  /**
   * 取到当前字段真正可用的触发器。
   *
   * 比如某个字段在新版 UI 里可能是 button，在老版里又可能是 combobox。
   * 这里会把所有候选触发器都试一遍，返回第一个真实存在的那个。
   */
  async getTrigger(timeoutMs = 15_000): Promise<Locator> {
    const candidates = this.getTriggerCandidates();

    // 某些控件会在不同版本里切换 DOM 结构，先探测哪个候选真的存在，再继续后续操作。
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

    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    throw new Error('未找到下拉字段触发器');
  }

  /**
   * 判断这个字段是否可见。
   *
   * 因为一个字段可能对应多个候选触发器，所以这里的逻辑是：
   * 只要任意一个候选可见，就认为这个字段当前可以使用。
   */
  async isVisible(): Promise<boolean> {
    for (const candidate of this.getTriggerCandidates()) {
      if (await candidate.isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 读取字段当前展示的值。
   *
   * 比如：
   * - 当前模型名称
   * - 当前分辨率文案
   * - 当前张数文案
   */
  async readValue(timeoutMs = 15_000): Promise<string> {
    const trigger = await this.getTrigger(timeoutMs);
    await waitForVisible(trigger, timeoutMs);
    return (await trigger.innerText()).trim();
  }

  /**
   * 打开字段对应的下拉面板。
   *
   * 如果调用方提供了 popupLocator，这里还会继续等待弹层出现，
   * 这样后续找选项时就不会撞上“触发器点开了，但弹层还没渲染完”的问题。
   */
  async open(timeoutMs = 15_000): Promise<void> {
    const trigger = await this.getTrigger(timeoutMs);
    await waitForVisible(trigger, timeoutMs);
    await trigger.click({ force: true });

    const popup = this.options?.popupLocator?.();
    if (popup) {
      await waitForVisible(popup, timeoutMs);
    }
  }

  /**
   * 选择某个下拉选项。
   *
   * 操作顺序是：
   * 1. 先读当前值，已经是目标值就直接返回
   * 2. 打开下拉
   * 3. 找到目标选项并点击
   * 4. 轮询字段展示值，确认页面状态真的切换成功
   */
  async selectOption(optionText: string, timeoutMs = 15_000): Promise<void> {
    const currentValue = await this.readValue(timeoutMs);
    if (normalizeText(currentValue).includes(normalizeText(optionText))) {
      return;
    }

    await this.open(timeoutMs);
    const option = await this.findOption(optionText, timeoutMs);
    await option.click({ force: true });

    await expect
      .poll(async () => normalizeText(await this.readValue(timeoutMs)), {
        timeout: timeoutMs,
        intervals: [500, 1_000],
      })
      .toContain(normalizeText(optionText));
  }

  /**
   * 把 triggerSource 统一转成数组。
   *
   * 这样后面就不用分支判断“它到底是单个 Locator 还是 Locator 数组”了。
   */
  private getTriggerCandidates(): Locator[] {
    const source = this.triggerSource();
    return Array.isArray(source) ? source : [source];
  }

  /**
   * 决定“去哪里找下拉选项”。
   *
   * 默认在整个 body 里找。
   * 如果调用方知道选项只会出现在某个独立弹层里，就传 popupLocator 进来把范围缩小。
   */
  private optionScope(): Locator {
    return this.options?.popupLocator?.() ?? this.page.locator('body');
  }

  /**
   * 生成一组选项候选定位器。
   *
   * 之所以返回多个候选，是因为同一个下拉选项在不同页面里可能被实现成：
   * - role=option
   * - button
   * - 纯文本节点
   * - 可点击 div
   */
  private optionCandidates(optionText: string, scope: Locator): Locator[] {
    const optionTextPattern = new RegExp(escapeRegex(optionText), 'i');
    // 下拉项在这套页面里可能是 option、button，甚至只是个可点击 div，这里统一做兼容。
    return [
      scope.getByRole('option', { name: optionTextPattern }).first(),
      scope.getByRole('button', { name: optionTextPattern }).first(),
      scope.getByText(optionText, { exact: true }).first(),
      scope.locator('[role="option"], button, [class*="cursor-pointer"], label, div')
        .filter({ hasText: optionTextPattern })
        .first(),
      ];
  }

  /**
   * 找到真正可用的目标选项定位器。
   *
   * 这里和 SectionPanelComponent 的思路一样：
   * 先准备多个候选，再等待至少一个候选出现，最后返回第一个真实存在的候选。
   */
  private async findOption(optionText: string, timeoutMs: number): Promise<Locator> {
    const scope = this.optionScope();
    const candidates = this.optionCandidates(optionText, scope);

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

    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return candidate;
      }
    }

    throw new Error(`未找到下拉选项: ${optionText}`);
  }

  /**
   * 判断某个候选定位器当前是否命中了元素。
   */
  private async exists(locator: Locator): Promise<boolean> {
    return (await locator.count().catch(() => 0)) > 0;
  }
}
