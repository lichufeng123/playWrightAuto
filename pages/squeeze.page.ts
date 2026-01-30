import { Page, Locator, expect} from '@playwright/test';

export class SqueezePage {
    readonly page : Page;
    readonly AgentTab: Locator;
    readonly AgentHeader: Locator;

    constructor(page: Page){
        this.page = page;
        this.AgentTab = page.getByRole('tab', { name: 'AI员工' })
        }
    async waitForReady(): Promise <void> {
        await expect(this.AgentTab).toBeVisible();
        await expect(this.AgentTab).toBeEnabled();
        }
    async clickAIEmployee(): Promise <void> {
        await this.waitForReady();
        await this.AgentTab.click();
        await expect(this.page).toHaveURL(/\/aichat/);
        }


    }