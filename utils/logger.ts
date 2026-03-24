import { promises as fs } from 'fs';
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
    await this.testInfo.attach(toSafeFileName(label), {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }

  async attachJson(label: string, payload: unknown): Promise<void> {
    await this.writeAttachment(
      label,
      JSON.stringify(payload, null, 2),
      'application/json',
      'json',
    );
  }

  async attachText(label: string, content: string): Promise<void> {
    await this.writeAttachment(label, content, 'text/plain', 'txt');
  }

  private async writeAttachment(
    label: string,
    content: string,
    contentType: string,
    extension: string,
  ): Promise<void> {
    await this.log(label);

    if (!this.testInfo) {
      return;
    }

    const filePath = this.testInfo.outputPath(`${toSafeFileName(label)}.${extension}`);
    await fs.writeFile(filePath, content, 'utf8');
    await this.testInfo.attach(toSafeFileName(label), {
      path: filePath,
      contentType,
    });
  }
}
