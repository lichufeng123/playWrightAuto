import { Page, Locator, expect } from '@playwright/test';

const WORKFLOW_TAB_LABEL = /工作流|宸ヤ綔娴?/; // 中文与编码文本兼容

export class SqueezePage {
    readonly page: Page;
    readonly AgentTab: Locator;
    readonly WorkflowTab: Locator;

    constructor(page: Page) {
        this.page = page;
        this.AgentTab = page.getByRole('tab', { name: /AI/ }).first();
        this.WorkflowTab = page.getByRole('tab', { name: WORKFLOW_TAB_LABEL }).first();
    }

    async waitForReady(): Promise<void> {
        await expect(this.AgentTab).toBeVisible();
        await expect(this.WorkflowTab).toBeVisible();
    }

    async clickAIEmployee(): Promise<void> {
        await this.waitForReady();
        await this.AgentTab.click();
        await expect(this.page).toHaveURL(/\/aichat/);
    }

    async clickWorkflow(): Promise<void> {
        await this.waitForReady();
        await this.WorkflowTab.click();
        await this.page.waitForLoadState('networkidle');
    }
}
