import { Page, Locator, expect } from '@playwright/test'

export class AgentPage {
    readonly page: Page;
    readonly main: Locator;
    readonly agentList: Locator;
    readonly addAgentListButton: Locator;
    readonly messageInput: Locator; // legacy alias
    readonly chatInput: Locator;
    readonly sendButton: Locator;
    readonly stopButton: Locator;
    readonly newChatButton: Locator;
    readonly messageList: Locator;
    readonly lastMessage: Locator;
    private readonly streamUrlPattern = /\/game-ai-editor-center\/chat\/ai-employee\/v1/;

    constructor(page: Page) {
        this.page = page;
        // 侧边栏整体
        this.agentList = page.getByRole('complementary');
        // 添加员工按钮 (限制在侧边栏内，通常是搜索框旁边的 + 号)
        this.addAgentListButton = this.agentList.getByRole('button').first();

        // Chat area (selectors vary by agent type; keep them resilient and scoped to main)
        this.main = page.getByRole('main');

        // 消息输入框
        this.chatInput = this.main.getByRole('textbox').first();
        this.messageInput = this.chatInput;
        // 发送按钮
        this.sendButton = this.main.getByRole('button', { name: /发送/ }).first();
        // 停止按钮 (正在生成态，部分员工不会出现)
        this.stopButton = this.main.getByRole('button', { name: /终止/ }).first();
        // 新建会话按钮（有些版本不是 button）
        this.newChatButton = this.main.getByText(/新建(对话|会话)/, { exact: true }).first();
        // 聊天消息区域（使用较宽的选择器，适配不同实现）
        this.messageList = this.main.locator('[data-message-id], [data-testid*="message"], [class*="message"]');
        this.lastMessage = this.messageList.last();
    }

    // 获取特定名称的员工列项
    agentItemByName(name: string): Locator {
        return this.findAgentByName(name);
    }

    // 灵活查找员工:支持精确匹配或带编号后缀的匹配
    private findAgentByName(name: string): Locator {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`${escaped}(\\s*\\(\\d+\\))?$`, 'i');
        const nameCell = this.agentList.locator('p, h5', { hasText: pattern }).first();
        return nameCell.locator('xpath=ancestor::div[.//button][1]');
    }

    private async resolveChatInput(): Promise<Locator> {
        if (await this.chatInput.count()) return this.chatInput;
        return this.main.locator('[contenteditable="true"], textarea, input[type="text"]').first();
    }

    // 等待页面加载完成
    async waitForReady(): Promise<void> {
        await expect(this.page).toHaveURL(/\/aichat/);
        await expect(this.agentList).toBeVisible();
    }

    // 等聊天区域可用：输入框可编辑、发送按钮可点击
    async waitForChatReady(): Promise<void> {
        await expect(this.sendButton).toBeVisible({ timeout: 30000 });
        const input = await this.resolveChatInput();
        await expect(input).toBeEditable({ timeout: 30000 });
        await this.sendButton.waitFor({ state: 'enabled', timeout: 2000 }).catch(() => {});
    }

    // 等待员工列表稳定
    async waitForAgentListReady(): Promise<void> {
        // 等侧边栏本身出现
        await expect(this.agentList).toBeVisible({ timeout: 30000 });
        await expect(this.addAgentListButton).toBeVisible({ timeout: 30000 });

        // 不要依赖固定“锚点员工”（不同环境可能没有该员工）。
        // 用更通用的信号判断：加载中消失 + 搜索框可用。
        await expect(this.agentList.getByText('加载中')).toHaveCount(0, { timeout: 30000 });
        await expect(this.agentList.getByRole('textbox').first()).toBeVisible({ timeout: 30000 });
    }

    // 确保员工可用 (自愈模式)
    async ensureAgentAvailable(name: string): Promise<void> {
        await this.waitForAgentListReady();

        // 使用灵活匹配检查员工是否存在(支持带编号后缀)
        const agent = this.findAgentByName(name);
        const count = await agent.count();

        if (count === 0) {
            console.log(`[Self-Healing] Agent "${name}" not found. Attempting to add it...`);
            await this.addAgent(name);
            // 添加后再次确认等待出现
            await expect(this.findAgentByName(name)).toBeVisible();
        }
    }

    // 发送消息（不包含等待回复结束）
    async sendMessage(text: string): Promise<void> {
        await this.waitForChatReady();
        const input = await this.resolveChatInput();
        await input.fill('');
        await input.fill(text);
        await expect(this.sendButton).toBeEnabled({ timeout: 10000 });
        await Promise.all([
            this.waitForReplyStarted({ timeout: 15000 }).catch(() => {}),
            this.sendButton.click()
        ]);
    }

    // 多轮对话发送：适用于上一轮回复后发送按钮暂不可用的场景，先输入再校验可用
    async sendMessageInOngoingChat(text: string): Promise<void> {
        await expect(this.sendButton).toBeVisible({ timeout: 30000 });
        const input = await this.resolveChatInput();
        await expect(input).toBeEditable({ timeout: 30000 });
        await input.fill('');
        await input.fill(text);
        await expect(this.sendButton).toBeEnabled({ timeout: 10000 });
        await Promise.all([
            this.waitForReplyStarted({ timeout: 15000 }).catch(() => {}),
            this.sendButton.click()
        ]);
    }

    // 等回复开始：仅依赖流式请求发起
    async waitForReplyStarted(opts?: { timeout?: number }): Promise<void> {
        const timeout = opts?.timeout ?? 15000;
        await this.page.waitForResponse(
            res => this.streamUrlPattern.test(res.url()) && res.request().method() === 'POST',
            { timeout }
        );
    }
    
    // 等回复完成：终止按钮恢复为发送按钮
    async waitForReplyFinished(opts?: { timeout?: number }): Promise<void> {
        const timeout = opts?.timeout ?? 60000;
        const start = Date.now();
        const remaining = () => Math.max(500, timeout - (Date.now() - start));

        // 等“终止”出现（如果存在终止态）
        await this.stopButton.waitFor({ state: 'visible', timeout: remaining() }).catch(() => {});
        // 等待回复结束信号：终止消失 + 发送按钮恢复，若发送按钮状态异常则退化为输入框可编辑
        await this.stopButton.waitFor({ state: 'hidden', timeout: remaining() }).catch(() => {});
        await this.sendButton.waitFor({ state: 'visible', timeout: remaining() }).catch(() => {});
        try {
            await expect(this.sendButton).toBeEnabled({ timeout: remaining() });
        } catch {
            const input = await this.resolveChatInput();
            await expect(input).toBeEditable({ timeout: remaining() });
        }
    }

    // 发送并等待回复完成
    async sendAndWaitReply(text: string, opts?: { timeout?: number; ensureMessageStable?: boolean }): Promise<void> {
        await this.sendMessage(text);
        await this.waitForReplyFinished(opts);
    }

    async getLastMessageText(): Promise<string> {
        return (await this.lastMessage.textContent().catch(() => ''))?.trim() ?? '';
    }

    // 添加员工逻辑
    async addAgent(name: string): Promise<void> {
        await this.waitForReady();
        console.log(`[addAgent] Attempting to add: "${name}"`);
        const dialog = this.page.getByRole('dialog', { name: '添加AI员工' });

        await this.addAgentListButton.click();
        await expect(dialog).toBeVisible();
        console.log(`[addAgent] Dialog visible`);

        const searchInput = dialog.getByRole('textbox', { name: '输入AI员工名称查询' });
        await searchInput.click();
        await searchInput.clear();
        await searchInput.fill(name);
        console.log(`[addAgent] Search filled with: "${name}"`);

        // 等待特定的搜索结果出现，并将其作为容器
        // 使用更精确的定位器过滤
        const agentCard = dialog.locator('div.flex').filter({
            has: this.page.getByRole('heading', { name: name, exact: true })
        }).first();

        console.log(`[addAgent] Waiting for agent card to be visible...`);
        await expect(agentCard).toBeVisible();
        console.log(`[addAgent] Agent card found`);

        const addButton = agentCard.getByRole('button', { name: '添加员工' });
        await expect(addButton).toBeVisible();

        console.log(`[addAgent] Clicking '添加员工' button...`);
        await addButton.click({ force: true });

        // 验证侧边栏出现该员工 (添加后直接检查列表)
        const addedAgent = this.findAgentByName(name);
        await expect(addedAgent).toBeVisible();

        if (await dialog.isVisible().catch(() => false)) {
            await this.page.keyboard.press('Escape').catch(() => { });
            await expect(dialog).toBeHidden();
        }

        console.log(`[addAgent] Agent "${name}" added successfully`);
    };

    // 选择员工进入会话
    async selectAgent(name: string): Promise<void> {
        const item = this.findAgentByName(name);
        await item.click();
        const input = await this.resolveChatInput();
        await expect(input).toBeVisible();
    }

    // 新建会话
    async newChat(): Promise<void> {
        await expect(this.newChatButton).toBeVisible();
        await this.newChatButton.click({ force: true });
        const input = await this.resolveChatInput();
        await expect(input).toBeVisible();
    }

    // 管理菜单操作
    private async openAgentMenu(name: string): Promise<void> {
        const item = this.findAgentByName(name);
        await expect(item).toBeVisible({ timeout: 15000 });

        // 部分环境只有一个“更多”按钮，直接取最后一个按钮做兜底
        const menuBtn = item.getByRole('button').last();
        await menuBtn.click({ force: true });
    }

    async renameAgent({ name, newName }: { name: string; newName: string }): Promise<void> {
        await this.openAgentMenu(name);
        await this.page.getByText('重命名').click();
        const input = this.page.locator(`input[value="${name}"]`);
        await input.fill(newName);
        await input.press('Enter');
        await expect(this.agentItemByName(newName)).toBeVisible();
    }

    async togglePinAgent(name: string, shouldPin: boolean): Promise<void> {
        await this.openAgentMenu(name);
        const text = shouldPin ? /置顶/ : /取消置顶/;
        await this.page.getByText(text).first().click();
    }

    async clearAgentChatHistory(name: string): Promise<void> {
        await this.openAgentMenu(name);
        await this.page.getByText(/清空|清除/).click();
        await this.page.getByRole('button', { name: /确 定|确认/ }).click();
    }

    async deleteAgent(name: string): Promise<void> {
        await this.openAgentMenu(name);
        await this.page.getByRole('menuitem', { name: /删除/ }).first().click();
        await this.page.getByRole('button', { name: /确 定|确认/ }).click();
        await expect(this.findAgentByName(name)).not.toBeVisible();
    }

    // 工具方法
    async getAllAgentNames(): Promise<string[]> {
        await this.waitForAgentListReady();
        const headings = await this.agentList.locator('p.font-medium').allTextContents();
        return headings.map(h => h.trim()).filter(h => h && h !== '已加载全部');
    }

    async deleteAllAgentsExcept(excludeNames: string[]): Promise<void> {
        let attempts = 0;
        const maxAttempts = 50;
        while (attempts < maxAttempts) {
            const names = await this.getAllAgentNames();
            const toDelete = names.filter(n => !excludeNames.some(ex => n.includes(ex)));
            if (toDelete.length === 0) break;
            for (const name of toDelete) {
                await this.deleteAgent(name);
            }
            attempts++;
        }
    }

    async clickHistoryTab(): Promise<void> {
        await this.page.getByText('历史记录', { exact: true }).click();
    }

    async openConversation(title: string): Promise<void> {
        await this.page.getByText(title).first().click();
    }
}
