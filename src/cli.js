/* eslint-env node */
/* eslint-disable no-console, max-len */

import Debug from 'debug';
import yargs from 'yargs';
import Migrations from './migrations';
import chalk from 'chalk';
import _ from 'lodash';
// import pkg from '../package.json';
import * as helpers from './helpers';

const debug = new Debug('dbmigrations');
const dotfile = helpers.dotfile();
const labels = '123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Given url or env returns a list of urls.
 * @param {string} url
 * @param {string} env
 * @return {array[string]} List of urls
 */
function urlsWithUrlAndEnv(url, env) {
  let r = [];
  if (url) {
    r.push(url);
  }
  if (env) {
    const envUrls = _.get(dotfile, [ 'envs', env ]);
    r.push(...envUrls);
  }
  return r;
}

async function create({ js, sql, name }, { log }) {
  let migrations = new Migrations();
  let migration = migrations.create({ name, sql: js !== true || sql === true });
  if (migration) {
    log(migration.coloredLine());
  }
}

async function check({ env, url }, { log }) {
  const urls = urlsWithUrlAndEnv(url, env);

  debug({ urls, url, env });
  let migrations = null;
  try {

    // Create migration objects for all urls.
    migrations = urls.map(e => new Migrations({ url: e }));
    debug({ migrations, foo: 1 });

    // Prepare for all.
    // TODO: We should be read only here, maybe add flag.
    await Promise.all(migrations.map(e => e.prepare()));

    // Print legend.
    migrations.forEach((e, i) => {
      log(`${labels[i]}. ${e.url}`);
    });

    const checks = await Promise.all(migrations.map(e => e.check()));
    checks.forEach((e, i) => {
      log(`${labels[i]}. ${migrations[i].url}`);
      for (let info of e) {
        log(info.coloredLine());
      }
      log();
    });

  } finally {
    if (migrations) {
      migrations.forEach(e => e.disconnect());
    }
  }
}

async function migrate({ url }, { log }) {
  let migrations = null;
  try {
    migrations = new Migrations({ url });
    await migrations.prepare();
    log(`${chalk.white(migrations.url)} connected.`);
    for (let { status, stamp } of await migrations.check()) {
      if (status === 'pending') {
        let info = await migrations.migrate(stamp);
        log(info.coloredLine());
        if (info.status !== 'migrated') {
          throw new Error(info.text);
        }
      }
    }
  } finally {
    migrations.disconnect();
  }
}

export default async function (originalArgs = process.argv, { log = console.log }) {

  const args = yargs(originalArgs)
    .wrap(null)
    .usage('$0 [command]')
    .command('create', 'Create migration file.')
    .command('check', 'Check migration status.')
    .command('migrate', 'Migrate database(s).')
    .demand(1, 'Command argument needs to be provided.');

  const { argv: { _: [ command ] } } = args;

  switch (command) {
    case 'create':
      args.reset()
        .wrap(null)
        .usage('$0 create [--js] --name="foo_bar"')
        .describe('js', 'Generate js file instead of sql.')
        .describe('name', 'Base name of the migration file.')
        .example('$0 create --name create_users', 'Creates "create_users" sql based migration.')
        .example('$0 create --js --name create_users', 'Creates "create_users" js based migration.')
        .help('help');
      await create(args.argv, { log });
      break;

    case 'check':
      args.reset()
        .wrap(null)
        .usage('$0 check [--env ENV=development] [--url URL]')
        .default({ env: 'development' })
        .describe('env', 'Use environment defined in .dbmigrations.json file.')
        .describe('url', 'Use provided URL (password is searched in ~/.pgpass file).')
        .example('$0 check --env development', 'Checks migration status for all databases defined in .dbmigrations.json as development environment.')
        .help('help');
      await check(args.argv, { log });
      break;

    case 'migrate':
      args.reset()
        .wrap(null)
        .usage('$0 migrate [--env ENV=development] [--url URL]')
        .default({ env: 'development' })
        .describe('env', 'Use environment defined in .dbmigrations.json file.')
        .describe('url', 'Use provided URL (password is searched in ~/.pgpass file).')
        .example('$0 migrate --env development', 'Migrates all databases defined in .dbmigrations.json as development environment.')
        .help('help');
      await migrate(args.argv, { log });
      break;

    default:
      args.showHelp();
  }
}
