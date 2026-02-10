// tests/test.setup.ts
import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { collectPageContext } from '../skills/page_context_collect';

test.afterEach(async ({ page }, testInfo) => {
  // 只在失败时触发
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }

  try {
    const context = await collectPageContext(page);

    // 失败产物统一放在 artifacts 目录
    const safeTitle = testInfo.title.replace(/[^\w\d]+/g, '_');
    const dir = path.join(
      process.cwd(),
      'artifacts',
      'failures',
      safeTitle
    );

    fs.mkdirSync(dir, { recursive: true });

    // dump DOM
    fs.writeFileSync(
      path.join(dir, 'dom.html'),
      context.dom
    );

    // dump screenshot
    fs.writeFileSync(
      path.join(dir, 'screenshot.png'),
      Buffer.from(context.screenshotBase64, 'base64')
    );

    // dump meta info
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify(
        {
          url: context.url,
          consoleErrors: context.consoleErrors,
          testTitle: testInfo.title,
          error: testInfo.error?.message,
        },
        null,
        2
      )
    );

    console.log(`[afterEach] failure context saved: ${dir}`);
  } catch (e) {
    // ⚠️ skill 出问题不影响 test 结果
    console.warn('[afterEach] collectPageContext failed, ignored:', e);
  }
});
