
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const assert = require('assert');
const Db = require('./db');
const pgpass = require('./pgpass');
const { template } = require('./helpers');
const MigrationInfo = require('./migration-info');

class Migrations {

  /**
   * Create new migrations instance.
   * @param {String} url Optional postgre url (doesn't need to be provided for Migrations#create only for example).
   * @param {String} root = `${__dirname}/../migrations` Migration definitions root directory.
   * @return {Migrations}
   */
  constructor({ url, root = './migrations', logger = console.log } = {}) {
    this.logger = logger;
    if (url) {
      this.reconnect(url);
    }
    this.reload(root);
  }

  log(...args) {
    if (this.logger) {
      this.logger(...args);
    }
  }

  /**
   * Reconnect to postgres database. Well not really, just setup everything in sync for async prepare which
   * does actual reconnection.
   * @param {String} url
   */
  reconnect(url) {
    this.disconnect();
    this.url = url;
    this.db = null;
  }

  /**
   * Check if postgres is accessible and migrations table exists (create one if doesn't).
   * @return {async Boolean}
   */
  async prepare() {
    this.db = new Db(await pgpass(this.url));
    if (await this.db.value("select '42';") !== '42') {
      throw new Error(`Prepare failed, is postgres accessible?`);
    }
    await this.maybeInit();
  }

  /**
   * If `migrations` table doesn't exist, create one.
   */
  async maybeInit() {
    const exists = await this.db.value(`select (to_regclass('public.migrations') is not null) "exists";`);
    if (!exists) {
      await this.db.query(`
        create table public.migrations (
          created_at timestamptz not null default now(),
          stamp text not null
        );
      `);
    }
  }

  /**
   * Disconnect postgres database.
   */
  disconnect() {
    this.url = null;
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Reload definitions from root.
   *
   * Migration definitions are in format:
   *   [ { stamp: '1437102000', text: 'init_migrations', ext: 'sql', sql: true }, ... ]
   *
   * @param {String} root
   */
  reload(root) {
    this.root = path.resolve(root);
    this.defs = fs.readdirSync(this.root).filter(fname => fname.match(/^\d{10}_/)).sort().map((fname) => {
      const [ , stamp, text, ext ] = fname.match(/^(\d{10})_([^.]+)\.(sql|js)$/);
      const fpath = path.resolve(this.root, fname);
      return {
        stamp,
        text,
        ext,
        sql: ext === 'sql' ? fs.readFileSync(fpath, 'utf8') : null,
        js: ext === 'js' ? require(fpath) : null // eslint-disable-line import/no-dynamic-require, global-require
      };
    });
  }

  /**
   * Create new local migration definition file.
   * @param {string} .text Migration name, ie. 'foo_bar'.
   * @param {boolean} .sql If true, creates sql migration, otherwise js.
   * @return {MigrationInfo}
   */
  create({ stamp = `${Math.floor(Date.now() / 1000)}`, name, sql = true }) {
    const base = name ? `${stamp}_${name}` : stamp;
    let fname = null;
    let content = null;
    if (sql) {
      fname = `${base}.sql`;
      content = template('sql', { stamp });
    } else {
      fname = `${base}.js`;
      content = template('js', { stamp });
    }
    const effectivePath = `${this.root}/${fname}`;
    fs.writeFileSync(effectivePath, content);
    return new MigrationInfo({ status: 'created', stamp, text: name, path: effectivePath });
  }

  /**
   * Get database migrations.
   * @return {async Array}
   */
  async dbDefs() {
    return this.db.rows('select * from public.migrations order by stamp asc;');
  }

  /**
   * Check migration status.
   * @param {String} stamp
   * @return {async Date} Timestamp when migration has been performed, null otherwise.
   */
  async markedAt(stamp) {
    return await this.db.value('select created_at from public.migrations where stamp = $1 limit 1;', [stamp]);
  }

  /**
   * Mark migration as performed.
   * @param {String} stamp
   * @return {async Date} Migration created at timestamp.
   */
  async mark(stamp) {
    return await this.db.value(
      'insert into public.migrations(stamp, created_at) values($1, now()) returning created_at;', [stamp]
    );
  }

  /**
   * Calculate diff between local definitions and database migrations.
   * @return {Array[MigrationInfo]}
   */
  async check() {
    const locals = this.defs;
    const remotes = await this.dbDefs();
    let i = 0;
    let j = 0;
    const r = [];

    const push = (options) => {
      r.push(new MigrationInfo(options));
    };

    const pushMigrated = (local, remote) => {
      push({ status: 'migrated', stamp: local.stamp, text: local.text, migratedAt: remote.createdAt });
    };

    const pushPending = (local) => {
      push({ status: 'pending', stamp: local.stamp, text: local.text });
    };

    const pushUnknown = (remote) => {
      push({ status: 'unknown', stamp: remote.stamp, migratedAt: remote.createdAt });
    };

    while (i < locals.length && j < remotes.length) {
      switch ((locals[i].stamp < remotes[j].stamp) - (locals[i].stamp > remotes[j].stamp)) {
        case 0: pushMigrated(locals[i], remotes[j]); i++; j++; break;
        case 1: pushPending(locals[i]); i++; break;
        case -1: pushUnknown(remotes[j]); j++; break;
        default:
          throw new TypeError('Will never happen.');
      }
    }

    while (i < locals.length) {
      pushPending(locals[i++]);
    }

    while (j < remotes.length) {
      pushUnknown(remotes[j++]);
    }

    return r;
  }

  /**
   * Perform single migration.
   * @param {String} stamp
   * @return {async MigrationInfo}
   */
  async migrate(stamp) {

    // Make sure we've got local definition.
    const def = _.find(this.defs, { stamp });
    assert(def, `Local definition with stamp ${stamp} not found.`);

    // Make sure it's not migrated.
    let migratedAt = await this.markedAt(stamp);
    assert(!migratedAt, `Migration already performed at ${migratedAt}.`);

    switch (true) {
      case !!def.sql:
        await this.db.query(def.sql);
        break;

      case !!def.js:
        await def.js(this.db);
        break;

      default:
        throw new TypeError('Unknown migration type, expected js or sql definitions.');
    }

    migratedAt = await this.mark(stamp);

    return new MigrationInfo({ status: 'migrated', stamp, text: def.text, migratedAt });
  }
}

module.exports = Migrations;
