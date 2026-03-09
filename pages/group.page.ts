import { Page, Locator, expect } from '@playwright/test'

export class GroupPage {
    readonly page: Page;
    readonly groupList: Locator;
    readonly addGroupButton: Locator;
    readonly chatInput: Locator;
    readonly sendButton: Locator;
    readonly stopButton: Locator;
    readonly newChatButton: Locator;
    readonly messageList: Locator;
    readonly lastMessage: Locator;
    private readonly streamUrlPattern = /\/game-ai-editor-center\/chat\/ai-employee\/v1/;

    constructor(page: Page) {
        this.page = page;
        this.groupList = page.getByRole('complementary');
        this.addGroupButton = this.groupList.getByRole('button').first();

        const main = page.getByRole('main');
        this.chatInput = main.getByRole('textbox').first();
        this.sendButton = main.getByRole('button', { name: /发送/ }).first();
        this.stopButton = main.getByRole('button', { name: /终止/ }).first();
        this.newChatButton = main.getByText(/新建(对话|会话)/, { exact: true }).first();
        this.messageList = main.locator('[data-message-id], [data-testid*="message"], [class*="message"]');
        this.lastMessage = this.messageList.last();
    }

    groupItemByName(name: string): Locator {
        return this.findGroupByName(name);
    }

    private findGroupByName(name: string): Locator {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`${escaped}(\\s*\\(\\d+\\))?$`, 'i');
        const nameCell = this.groupList.locator('p, h5', { hasText: pattern }).first();
        return nameCell.locator('xpath=ancestor::div[.//button][1]');
    }

    async waitForReady(): Promise<void> {
        await expect(this.page).toHaveURL(/\/aigroup/);
        await expect(this.groupList).toBeVisible();
    }

    async waitForGroupListReady(): Promise<void> {
        await expect(this.groupList).toBeVisible({ timeout: 30000 });
        await expect(this.addGroupButton).toBeVisible({ timeout: 30000 });
        await expect(this.groupList.getByRole('textbox').first()).toBeVisible({ timeout: 30000 });
    }

    async waitForChatReady(): Promise<void> {
        await expect(this.sendButton).toBeVisible({ timeout: 30000 });
        await expect(this.sendButton).toBeEnabled({ timeout: 30000 });
        await expect(this.chatInput).toBeEditable({ timeout: 30000 });
    }

    async ensureGroupAvailable(name: string): Promise<void> {
        await this.waitForGroupListReady();
        const group = this.findGroupByName(name);
        const count = await group.count();
        if (count === 0) {
            console.log(`[Self-Healing] Group "${name}" not found. Attempting to add it...`);
            await this.addGroup(name);
            await expect(this.findGroupByName(name)).toBeVisible();
        }
    }

    async addGroup(name: string): Promise<void> {
        await this.waitForReady();
        const dialog = this.page.getByRole('dialog', { name: /添加AI群组/ });

        await this.addGroupButton.click();
        await expect(dialog).toBeVisible();

        const searchInput = dialog.getByRole('textbox');
        await searchInput.click();
        await searchInput.clear();
        await searchInput.fill(name);

        const groupCard = dialog.locator('div.flex').filter({
            has: this.page.getByRole('heading', { name: name, exact: true })
        }).first();
        await expect(groupCard).toBeVisible();

        const addButton = groupCard.getByRole('button', { name: /添加/ });
        await expect(addButton).toBeVisible();
        await addButton.click({ force: true });

        await expect(this.findGroupByName(name)).toBeVisible();

        if (await dialog.isVisible().catch(() => false)) {
            await this.page.keyboard.press('Escape').catch(() => {});
            await expect(dialog).toBeHidden();
        }
    }

    async selectGroup(name: string): Promise<void> {
        const item = this.findGroupByName(name);
        await item.click();
        await expect(this.chatInput).toBeVisible();
    }

    async newChat(): Promise<void> {
        await expect(this.newChatButton).toBeVisible();
        await this.newChatButton.click({ force: true });
        await expect(this.chatInput).toBeVisible();
    }

    async waitForReplyStarted(opts?: { timeout?: number }): Promise<void> {
        const timeout = opts?.timeout ?? 15000;
        await this.page.waitForResponse(
            res => this.streamUrlPattern.test(res.url()) && res.request().method() === 'POST',
            { timeout }
        );
    }

    async waitForReplyFinished(opts?: { timeout?: number }): Promise<void> {
        const timeout = opts?.timeout ?? 60000;
        const start = Date.now();
        const remaining = () => Math.max(500, timeout - (Date.now() - start));

        await this.stopButton.waitFor({ state: 'visible', timeout: remaining() }).catch(() => {});
        await expect(this.sendButton).toBeVisible({ timeout: remaining() });
        await expect(this.sendButton).toBeEnabled({ timeout: remaining() }).catch(() => {});
    }

    async sendMessage(text: string): Promise<void> {
        await this.waitForChatReady();
        await this.chatInput.fill('');
        await this.chatInput.fill(text);
        await Promise.all([
            this.waitForReplyStarted({ timeout: 15000 }).catch(() => {}),
            this.sendButton.click()
        ]);
    }
}
