
import { Page } from '@playwright/test';

export interface PageContext {
    url: string;
    dom: string;
    screenshotBase64: string;
    consoleErrors: string[];
}

export async function collectPageContext(page: Page): Promise<PageContext> {
    const consoleErrors: string[] = [];

    // 采集 console error（只收 error，避免噪音）
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    const [dom, screenshot] = await Promise.all([
        page.content(),
        page.screenshot({ fullPage: true }),
    ]);

    return {
        url: page.url(),
        dom,
        screenshotBase64: screenshot.toString('base64'),
        consoleErrors,
    };
}
