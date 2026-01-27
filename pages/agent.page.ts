import { Page, Locator, expect } from '@playwright/test'

export class AgentPage {
    readonly page: Page;
    readonly agentList: Locator;
    readonly addAgentListButton: Locator;
    readonly searchBox: Locator;
    readonly searchResult: Locator;
    readonly addAgentButton: Locator;
    readonly Message: Locator;
    readonly SendButton: Locator;

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

        // 输入框-发送键
        this.SendButton = page.getByRole('button', { name: ' 发送' });
    }

    agentItemByName(name: string): Locator {
        return this.agentList.getByText(name, { exact: true });
    }
    messageByAgent(text: string): Locator {
        return this.getByText(text, { exact: true });
    }

    // 等到AI模块渲染完成
    async waitForReady(): Promise<void> {
        //  页面路径正确（防止误页）
        await expect(this.page).toHaveURL(/\/aichat/);
        //  左侧员工列表已渲染
        await expect(this.page.getByText('加载中')).not.toBeVisible();
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

    // 验证智能体是否存在，不存在则自动创建
    async ensureAgentExists(name: string): Promise<void> {
        const count = await this.agentItemByName(name).count();
        if (count > 0) {
            return;
        }
        await this.addAgent(name);
    }
    // 发送消息
    async sendMessage(name: string, text: string): Promise<void> {
        await this.waitForReady();
        const agent = this.agentItemByName(name);
        const message = this.messageByAgent('请分析/处理以下文档或需求： ，请重点关注 ，并生成 。')
        await expect(this.SendButton).toBeVisible();
        await message.fill('你好')
        await this.SendButton.click();

    };


    async chatInput() { };

    async messageList() { };
    async lastMessage() { };

}