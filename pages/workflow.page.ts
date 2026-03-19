import { Page, Locator, expect } from '@playwright/test'

export class AgentPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;

    }

}