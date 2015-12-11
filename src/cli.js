/* eslint-env node */
/* eslint-disable no-console */

import { Command } from 'commander';
import { Migrations } from './migrations';
import chalk from 'colors';
import pkg from '../package.json';

/**
 * Action wrapper logging errors.
 * @param  {Function|Promise} func
 */
function wrapper(func) {
  return function (...args) {
    Promise.resolve(func(...args)).catch(err => console.error(chalk.red(err.stack)));
  };
}

const program = new Command('dbmigrations');

program
  .version(pkg.version)
  .usage('dbmigrations [command] [options]')
  .description(pkg.description);

program
  .command('create [text]')
  .description('Create migration file.')
  .option('--js', 'Create JavaScript migration file instead of SQL one.')
  .action(wrapper(async function (text, { js }) {
    let migrations = new Migrations();
    let migration = migrations.create({ text, sql: js !== true });
    if (migration) {
      console.log(migration.coloredLine());
    }
  }));

program
  .command('check')
  .description('Check migration status.')
  .option('--url [url]', 'PostgreSQL URL.', 'postgresql://127.0.0.1/test')
  .action(wrapper(async function ({ url }) {
    let migrations = null;
    try {
      migrations = new Migrations({ url });
      await migrations.prepare();
      console.log(`${chalk.white(migrations.url)} connected.`);
      for (let info of await migrations.check()) {
        console.log(info.coloredLine());
      }
    } finally {
      migrations.disconnect();
    }
  }));

program
  .command('migrate')
  .description('Migrate database.')
  .option('--url [url]', 'PostgreSQL URL.', 'postgresql://127.0.0.1/test')
  .action(wrapper(async function ({ url }) {
    let migrations = null;
    try {
      migrations = new Migrations({ url });
      await migrations.prepare();
      console.log(`${chalk.white(migrations.url)} connected.`);
      for (let { status, stamp } of await migrations.check()) {
        if (status === 'pending') {
          let info = await migrations.migrate(stamp);
          console.log(info.coloredLine());
          if (info.status !== 'migrated') {
            throw new Error(info.text);
          }
        }
      }
    } finally {
      migrations.disconnect();
    }
  }));

const userArgs = process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);
switch (userArgs[0]) {
  case 'create':
  case 'check':
  case 'migrate':
    program.parse(userArgs);
    break;
  default:
    program.outputHelp();
}
