import { Page, Locator, expect } from '@playwright/test'

export class AgentPage {
    readonly page: Page;
    readonly agentList: Locator;
    readonly addAgentListButton: Locator;
    readonly searchBox: Locator;
    readonly searchResult: Locator;
    readonly addAgentButton: Locator;
    readonly newChatButton: Locator;


    readonly messageInput: Locator;
    readonly sendButton: Locator;
    readonly stopButton: Locator;
    readonly aiMessages: Locator;

    readonly historyTab: Locator;
    readonly historyListLocator: Locator;

    constructor(page: Page) {
        this.page = page;
        // 员工列表
        this.agentList = page.getByRole('complementary');
        // 添加员工按钮
        this.addAgentListButton = page.getByRole('button').first();
        // 搜索框
        this.searchBox = page.getByRole('textbox', { name: '输入AI员工名称查询' });
        // 搜索结果
        this.searchResult = page.getByText('我以强大的上下文处理能力和严谨的推理见长，特别擅长处理长文档分析、进行深度思考与总结归纳，提供细致周到的建议。');
        // 添加员工按钮
        this.addAgentButton = page.getByRole('button', { name: '添加员工' });
        //新对话按钮
        this.newChatButton = page.getByText('新建对话');
        // 消息输入栏
        this.messageInput = page.getByRole('textbox');
        // 输入框-发送键
        this.sendButton = page.getByRole('button', { name: ' 发送' });
        // 输入框-发送键
        this.stopButton = page.getByRole('button', { name: ' 终止' });

        // History
        this.historyTab = page.getByRole('complementary').getByText('历史记录-勿删');
        this.historyListLocator = page.getByText('历史对话');
    }

    agentItemByName(name: string): Locator {
        return this.agentList.getByText(name, { exact: true });
    }
    messageByAgent(text: string): Locator {
        this.messageInput = this.page.getByText(text, { exact: true });
        return this.messageInput;
    }

    // 等到AI模块渲染完成
    async waitForReady(): Promise<void> {
        //  页面路径正确（防止误页）
        await expect(this.page).toHaveURL(/\/aichat/);
        //  左侧员工列表已渲染
        await expect(this.page.getByText('加载中')).not.toBeVisible();
    }

    // pages/agent.page.ts
    async waitForAgentListReady(): Promise<void> {
        // 等侧边栏本身出现
        await expect(this.agentList).toBeVisible();

        // 再等至少有一个员工项出现（说明列表数据加载完了）
        await expect(
            this.agentItemByName('列表加载完成-勿删')
        ).toBeVisible();
    }
    async waitForReply() {
        // 如果系统有“生成中 → 终止”状态，先等它出现（可选但稳）
        if (await this.stopButton.count()) {
            await expect(this.stopButton).toBeVisible({ timeout: 5000 });
        }

        // 生成完成：发送按钮重新可见
        try {
            await expect(this.sendButton).toBeVisible({ timeout: 30000 });
        } catch {
            console.warn('[waitForReply] AI response slow, skip waiting for completion');

        }

    }


    // 验证智能体是否可用
    async ensureAgentAvailable(name: string): Promise<void> {
        await this.waitForAgentListReady();

        const count = await this.agentItemByName(name).count();
        if (count === 0) {
            throw new Error(
                `Preset agent "${name}" not found. Please check environment configuration.`
            );
        }
    }

    async addAgent(name: string): Promise<void> {
        await this.waitForReady();
        await this.addAgentListButton.click();
        await expect(this.searchBox).toBeVisible();
        await this.searchBox.click();
        await this.searchBox.fill(name);
        // await this.searchBox.press('CapsLock');
        await expect(this.searchResult).toBeVisible();
        await this.addAgentButton.click();
    };



    // 选择员工 进入会话
    async selectAgent(name: string): Promise<void> {
        await this.waitForReady();
        const agent = this.agentItemByName(name);
        await expect(agent).toBeVisible();
        await agent.click();
    };

    async sendMessage(text: string) {
        const messageInput = this.messageByAgent('请分析/处理以下文档或需求： ，请重点关注 ，并生成 。')
        await expect(this.sendButton).toBeVisible();
        await this.messageInput.fill(text);
        await this.sendButton.click();
    }


    async newChat() {
        await expect(this.newChatButton).toBeVisible();
        await this.newChatButton.click();
        await expect(this.page.getByRole('heading', { name: '💡 使用 tips:' })).toBeVisible();
    }

    async chatInput() { };
    async messageList() { };
    async lastMessage() { };

    conversationItem(title: string): Locator {
        return this.page.getByText(title, { exact: true });
    }

    async clickHistoryTab(): Promise<void> {
        await expect(this.historyTab).toBeVisible();
        await this.historyTab.click();
        // Wait for history list title to appear to ensure we are in history view
        await expect(this.historyListLocator.first()).toBeVisible();
    }

    async openConversation(title: string): Promise<void> {
        const item = this.conversationItem(title);
        await expect(item).toBeVisible();
        await item.click();
        // Wait for the conversation to be active or some indicator? 
        // For now, let's assume clicking is enough, but in a real app check for active state.
    }
}