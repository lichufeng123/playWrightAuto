import { Page, TestInfo } from '@playwright/test';

function toSafeFileName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').replace(/_+/g, '_');
}

export class StepLogger {
  constructor(
    private readonly page: Page,
    private readonly testInfo?: TestInfo,
    private readonly scope = 'workflow',
  ) {}

  async log(message: string): Promise<void> {
    console.log(`[${this.scope}] ${message}`);
  }

  async capture(label: string): Promise<void> {
    await this.log(label);

    if (!this.testInfo) {
      return;
    }

    const screenshotPath = this.testInfo.outputPath(`${toSafeFileName(label)}.png`);
    await this.page.screenshot({
      path: screenshotPath,
    });
  }
}
