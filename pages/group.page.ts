import { Page, Locator, Response, expect } from '@playwright/test'

export class GroupPage {
    readonly page: Page;
    readonly main: Locator;
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

        this.main = page.getByRole('main');
        this.chatInput = this.main.getByRole('textbox').first();
        this.sendButton = this.main.getByRole('button', { name: /发送/ }).first();
        this.stopButton = this.main.getByRole('button', { name: /终止/ }).first();
        this.newChatButton = this.main.getByText(/新建(对话|会话)/, { exact: true }).first();
        this.messageList = this.main.locator('[data-message-id], [data-testid*="message"], [class*="message"]');
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

    private async resolveChatInput(): Promise<Locator> {
        if (await this.chatInput.count()) return this.chatInput;
        return this.main.locator('[contenteditable="true"], textarea, input[type="text"]').first();
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
        const input = await this.resolveChatInput();
        await expect(input).toBeEditable({ timeout: 30000 });
        await this.sendButton.waitFor({ state: 'enabled', timeout: 2000 }).catch(() => {});
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
        const input = await this.resolveChatInput();
        await expect(input).toBeVisible();
    }

    async newChat(): Promise<void> {
        await expect(this.newChatButton).toBeVisible();
        await this.newChatButton.click({ force: true });
        const input = await this.resolveChatInput();
        await expect(input).toBeVisible();
    }

    async waitForReplyStarted(opts?: { timeout?: number }): Promise<void> {
        const timeout = opts?.timeout ?? 15000;
        await this.page.waitForResponse(
            res => this.streamUrlPattern.test(res.url()) && res.request().method() === 'POST',
            { timeout }
        );
    }

    private async captureReplyResponse(timeout = 15000): Promise<Response | null> {
        return await this.page.waitForResponse(
            res => this.streamUrlPattern.test(res.url()) && res.request().method() === 'POST',
            { timeout }
        ).catch(() => null);
    }

    private async waitForResponseFinished(response: Response | null, timeoutMs: number): Promise<void> {
        if (!response) {
            return;
        }

        await Promise.race([
            response.finished().catch(() => null),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('等待群组回复流结束超时')), timeoutMs);
            }),
        ]).catch(() => undefined);
    }

    async waitForReplyFinished(opts?: { timeout?: number; response?: Response | null }): Promise<void> {
        const timeout = opts?.timeout ?? 60000;
        const start = Date.now();
        const remaining = () => Math.max(500, timeout - (Date.now() - start));
        const uiRecoveryTimeout = () => Math.min(30000, Math.max(2000, remaining()));
        const responseFinishedTimeout = Math.min(
            Math.max(30000, Math.floor(timeout / 2)),
            Math.max(30000, timeout - 10000),
        );

        await this.waitForResponseFinished(opts?.response ?? null, responseFinishedTimeout);

        await this.stopButton.waitFor({ state: 'visible', timeout: remaining() }).catch(() => {});
        await this.stopButton.waitFor({ state: 'hidden', timeout: remaining() }).catch(() => {});
        await this.sendButton.waitFor({ state: 'visible', timeout: remaining() }).catch(() => {});
        try {
            await expect(this.sendButton).toBeEnabled({ timeout: uiRecoveryTimeout() });
        } catch {
            const input = await this.resolveChatInput();
            await expect(input).toBeEditable({ timeout: uiRecoveryTimeout() });
        }
    }

    async sendMessage(text: string): Promise<Response | null> {
        await this.waitForChatReady();
        const input = await this.resolveChatInput();
        await input.fill('');
        await input.fill(text);
        await expect(this.sendButton).toBeEnabled({ timeout: 10000 });
        const responsePromise = this.captureReplyResponse(15000);
        await Promise.all([
            responsePromise,
            this.sendButton.click()
        ]);
        return await responsePromise;
    }

    async sendMessageInOngoingChat(text: string): Promise<Response | null> {
        await expect(this.sendButton).toBeVisible({ timeout: 30000 });
        const input = await this.resolveChatInput();
        await expect(input).toBeEditable({ timeout: 30000 });
        await input.fill('');
        await input.fill(text);
        await expect(this.sendButton).toBeEnabled({ timeout: 10000 });
        const responsePromise = this.captureReplyResponse(15000);
        await Promise.all([
            responsePromise,
            this.sendButton.click()
        ]);
        return await responsePromise;
    }

    async sendAndWaitReply(text: string, opts?: { timeout?: number }): Promise<void> {
        const response = await this.sendMessage(text);
        await this.waitForReplyFinished({ ...opts, response });
    }
}
