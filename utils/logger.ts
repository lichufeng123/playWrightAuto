import { promises as fs } from 'fs';
import path from 'path';
import { Page, TestInfo } from '@playwright/test';

function toSafeFileName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').replace(/_+/g, '_');
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function inferExtension(url: string, contentType: string | null): string {
  const matched = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (matched?.[1]) {
    return matched[1].toLowerCase();
  }

  if (!contentType) {
    return 'bin';
  }

  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg')) return 'jpg';
  if (contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'bin';
}

export class StepLogger {
  private readonly runStamp = formatTimestamp();

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

    const screenshotPath = this.buildOutputPath(`${toSafeFileName(label)}.png`);
    await this.ensureParentDir(screenshotPath);
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

  async downloadFile(label: string, url: string): Promise<void> {
    await this.log(`${label}: ${url}`);

    if (!this.testInfo) {
      return;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载产物失败: ${response.status()} ${url}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const extension = inferExtension(url, contentType);
    const filePath = this.buildOutputPath(`${toSafeFileName(label)}.${extension}`);
    await this.ensureParentDir(filePath);

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    await this.testInfo.attach(toSafeFileName(label), {
      path: filePath,
      contentType,
    });
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

    const filePath = this.buildOutputPath(`${toSafeFileName(label)}.${extension}`);
    await this.ensureParentDir(filePath);
    await fs.writeFile(filePath, content, 'utf8');
    await this.testInfo.attach(toSafeFileName(label), {
      path: filePath,
      contentType,
    });
  }

  private buildOutputPath(fileName: string): string {
    if (!this.testInfo) {
      return fileName;
    }
    return this.testInfo.outputPath(path.join(this.runStamp, fileName));
  }

  private async ensureParentDir(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }
}
