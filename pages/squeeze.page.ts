import { Page, Locator, expect } from '@playwright/test';

const WORKFLOW_TAB_LABEL = /工作流|宸ヤ綔娴?/; // 中文与编码文本兼容
const GROUP_TAB_LABEL = /AI群组|AI缇ょ粍/;

export class SqueezePage {
    readonly page: Page;
    readonly AgentTab: Locator;
    readonly WorkflowTab: Locator;
    readonly GroupTab: Locator;

    constructor(page: Page) {
        this.page = page;
        this.AgentTab = page.getByRole('tab', { name: /AI/ }).first();
        this.WorkflowTab = page.getByRole('tab', { name: WORKFLOW_TAB_LABEL }).first();
        this.GroupTab = page.getByRole('tab', { name: GROUP_TAB_LABEL }).first();
    }

    async waitForReady(): Promise<void> {
        await expect(this.AgentTab).toBeVisible();
        await expect(this.WorkflowTab).toBeVisible();
        await expect(this.GroupTab).toBeVisible();
    }

    async clickAIEmployee(): Promise<void> {
        await this.waitForReady();
        await this.AgentTab.click();
        await expect(this.page).toHaveURL(/\/aichat/);
    }

    async clickAIGroup(): Promise<void> {
        await this.waitForReady();
        await this.GroupTab.click();
        await expect(this.page).toHaveURL(/\/aigroup/);
    }

    async clickWorkflow(): Promise<void> {
        await this.waitForReady();
        await this.WorkflowTab.click();
        await this.page.waitForLoadState('networkidle');
    }
}
