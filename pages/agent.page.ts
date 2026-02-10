import { Page, Locator, expect } from '@playwright/test'

export class AgentPage {
    readonly page: Page;
    readonly agentList: Locator;
    readonly addAgentListButton: Locator;
    readonly messageInput: Locator;
    readonly sendButton: Locator;
    readonly stopButton: Locator;
    readonly newChatButton: Locator;

    constructor(page: Page) {
        this.page = page;
        // 侧边栏整体
        this.agentList = page.getByRole('complementary');
        // 添加员工按钮 (限制在侧边栏内，通常是搜索框旁边的 + 号)
        this.addAgentListButton = this.agentList.getByRole('button').first();

        // Chat area (selectors vary by agent type; keep them resilient and scoped to main)
        const main = page.getByRole('main');

        // 消息输入框
        this.messageInput = main.getByRole('textbox').first();
        // 发送按钮
        this.sendButton = main.getByRole('button', { name: /发送/ }).first();
        // 停止按钮 (正在生成态，部分员工不会出现)
        this.stopButton = main.getByRole('button', { name: /终止/ }).first();
        // 新建会话按钮（有些版本不是 button）
        this.newChatButton = main.getByText(/新建(对话|会话)/, { exact: true }).first();
    }

    // 获取特定名称的员工列项
    agentItemByName(name: string): Locator {
        return this.page.locator('div[class*="agent-item"]').filter({ hasText: name });
    }

    // 灵活查找员工:支持精确匹配或带编号后缀的匹配
    private findAgentByName(name: string): Locator {
        return this.page.locator('div').filter({
            has: this.page.getByRole('heading', { name: new RegExp(`^${name}(\\(\\d+\\))?$`), exact: false })
        }).first();
    }

    // 等待页面加载完成
    async waitForReady(): Promise<void> {
        await expect(this.page).toHaveURL(/\/aichat/);
        await expect(this.agentList).toBeVisible();
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
        await expect(this.messageInput).toBeVisible();
    }

    // 发送消息
    async sendMessage(text: string): Promise<void> {
        await expect(this.messageInput).toBeVisible();
        await this.messageInput.fill(text);
        await expect(this.sendButton).toBeVisible();
        await this.sendButton.click({ force: true });

        // Best-effort: some agents are template-based and won't show "终止"
        await expect(this.stopButton).toBeVisible({ timeout: 5000 }).catch(() => { });
    }

    // 新建会话
    async newChat(): Promise<void> {
        await expect(this.newChatButton).toBeVisible();
        await this.newChatButton.click({ force: true });
        await expect(this.messageInput).toBeVisible();
    }

    // 管理菜单操作
    private async openAgentMenu(name: string): Promise<void> {
        const item = this.findAgentByName(name);
        await item.hover();
        const menuBtn = item.locator('.anticon-more, button').last();
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
        await this.page.getByText(/删除/).click();
        await this.page.getByRole('button', { name: /确 定|确认/ }).click();
        await expect(this.findAgentByName(name)).not.toBeVisible();
    }

    // 工具方法
    async getAllAgentNames(): Promise<string[]> {
        await this.waitForAgentListReady();
        const headings = await this.page.locator('div[class*="agent-item"] h5, p.font-medium').allTextContents();
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
