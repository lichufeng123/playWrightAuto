const { spawnSync } = require('child_process');

function parseArgs(argv) {
  let envName;
  let user;
  let phone;
  let code;
  let refresh = false;
  let passthrough = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      passthrough = argv.slice(i + 1);
      break;
    }

    if (arg === '--env' || arg.startsWith('--env=')) {
      envName = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }

    if (arg === '--user' || arg.startsWith('--user=')) {
      user = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }

    if (arg === '--phone' || arg.startsWith('--phone=')) {
      phone = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }

    if (arg === '--code' || arg.startsWith('--code=')) {
      code = arg.includes('=') ? arg.split('=').slice(1).join('=') : argv[++i];
      continue;
    }

    if (arg === '--refresh') {
      refresh = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      // eslint-disable-next-line no-console
      console.log(
        [
          'Usage:',
          '  node scripts/pw-run.js [--env test|prod] [--user testUser|prodUser] [--phone <phone>] [--code <code>] [--refresh] -- [playwright args]',
          '',
          'Examples:',
          '  node scripts/pw-run.js --env prod',
          '  node scripts/pw-run.js --env prod --user prodUser',
          '  node scripts/pw-run.js --env prod --refresh',
          '  node scripts/pw-run.js --env test -- --list',
        ].join('\n')
      );
      process.exit(0);
    }
  }

  return { envName, user, phone, code, refresh, passthrough };
}

const { envName, user, phone, code, refresh, passthrough } = parseArgs(process.argv.slice(2));

const childEnv = { ...process.env };
if (envName) childEnv.PW_ENV = envName;
if (user) childEnv.PW_USER = user;
if (phone) childEnv.LOGIN_PHONE = phone;
if (code) childEnv.LOGIN_CODE = code;
if (refresh) childEnv.PW_REFRESH_STATE = '1';

const cliPath = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cliPath, 'test', ...passthrough], {
  stdio: 'inherit',
  env: childEnv,
});

if (result.error) {
  // eslint-disable-next-line no-console
  console.error('[pw-run] Failed to spawn Playwright:', result.error);
}

process.exit(result.status ?? 1);
