import { Page } from '@playwright/test';

export interface PageContextSnapshot {
  url: string;
  title: string;
  dom: string;
  screenshotBase64: string;
  consoleErrors: string[];
}

export async function collectPageContext(page: Page): Promise<PageContextSnapshot> {
  const [url, title, dom, screenshotBuffer, consoleErrors] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ''),
    page.content(),
    page.screenshot({ fullPage: true, type: 'png' }),
    readConsoleErrors(page),
  ]);

  return {
    url,
    title,
    dom,
    screenshotBase64: screenshotBuffer.toString('base64'),
    consoleErrors,
  };
}

async function readConsoleErrors(page: Page): Promise<string[]> {
  const maybeConsoleMessages = (page as Page & {
    consoleMessages?: () => Promise<Array<{ type?: () => string; text?: () => string }>>;
  }).consoleMessages;

  if (!maybeConsoleMessages) {
    return [];
  }

  try {
    const messages = await maybeConsoleMessages.call(page);
    return messages
      .filter(message => message.type?.() === 'error')
      .map(message => message.text?.() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}
