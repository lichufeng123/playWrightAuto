const fs = require('fs');
const path = require('path');

const screenshotDir = path.join(__dirname, '../test-results/batch-screenshots');
const reportFile = path.join(__dirname, '../test-results/BATCH_SUMMARY.md');

function generateReport() {
    if (!fs.existsSync(screenshotDir)) {
        console.error('Screenshot directory not found: ' + screenshotDir);
        return;
    }

    const files = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));

    let markdown = '# 🤖 AI 员工批量测试执行报告\n\n';
    markdown += `生成时间: ${new Date().toLocaleString()}\n\n`;
    markdown += '| 员工名称 | 执行截图 |\n';
    markdown += '| --- | --- |\n';

    files.sort().forEach(file => {
        const agentName = path.basename(file, '.png').replace(/_/g, ' ');
        markdown += `| ${agentName} | ![](${path.join('batch-screenshots', file)}) |\n`;
    });

    fs.writeFileSync(reportFile, markdown);
    console.log('Report generated at: ' + reportFile);
}

generateReport();
