
/* eslint-disable no-console */

import fs from 'fs';
import Sequelize from 'sequelize';
import _ from 'lodash';
import assert from 'assert';
import sprintf from 'sprintf';
import chalk from 'chalk';

/**
 * Represents single migration.
 */
export class MigrationInfo {

  static statusColors = {
    created: 'green',
    migrated: 'green',
    pending: 'yellow',
    unknown: 'red',
    error: 'red'
  };

  constructor({ stamp, status, text = null, migratedAt = null, path = null } = {}) {
    _.assign(this, { stamp, status, text, migratedAt, path });
  }

  /**
   * Colored line for migration.
   * @return {string}
   */
  coloredLine() {
    let line = _.compact([
      new Date().toISOString(),
      this.stamp,
      sprintf('%8s', this.status),
      this.text,
      this.migratedAt ? `(migrated ${this.migratedAt})` : null,
      this.path ? `(${this.path})` : null
    ]).join(' ');
    let color = MigrationInfo.statusColors[this.status];
    if (!color) {
      throw new TypeError(
        `Unknown status ${this.status}, expected one of ${_.keys(MigrationInfo.statusColors).join(', ')}.`
      );
    }
    return chalk[color](line);
  }
}

export class Migrations {

  /**
   * Create new migrations instance.
   * @param {String} url Optional postgre url (doesn't need to be provided for Migrations#create only for example).
   * @param {String} root = `${__dirname}/../migrations` Migration definitions root directory.
   * @return {Migrations}
   */
  constructor({ url, root = `${__dirname}/../migrations`, logger = console.log } = {}) {
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
   * Reconnect to postgres database.
   * @param {String} url
   */
  reconnect(url) {
    this.disconnect();
    this.url = url;
    this.db = new Sequelize(url, { logging: null });
  }

  /**
   * Check if postgres is accessible and migrations table exists (create one if doesn't).
   * @return {async Boolean}
   */
  async prepare() {
    await this.db.authenticate();
    await this.maybeInit();
  }

  /**
   * If `migrations` table doesn't exist, create one.
   */
  async maybeInit() {
    let queryInterface = this.db.getQueryInterface();
    let table = null;
    try {
      table = await queryInterface.describeTable('migrations');
    } catch (err) {
      table = null;
    }
    if (table) {
      await queryInterface.createTable('migrations', {
        'created_at': { type: Sequelize.DATE, allowNull: false, default: Sequelize.fn('NOW') },
        'stamp': { type: Sequelize.TEXT, allowNull: false }
      });
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
    this.root = root;
    this.defs = fs.readdirSync(this.root).filter((fname) => fname.match(/^\d{10}\_/)).sort().map((fname) => {
      let [, stamp, text, ext] = fname.match(/^(\d{10})_([^\.]+)\.(sql|js)$/);
      let path = `${this.root}/${fname}`;
      return {
        stamp, text, ext,
        sql: ext === 'sql' ? fs.readFileSync(path, 'utf8') : null,
        js: ext === 'js' ? require(path) : null
      };
    });
  }

  /**
   * Create new local migration definition file.
   * @param {Object} options
   * @param {String} options.text Migration name, ie. 'foo_bar'.
   * @param {Boolean} options.sql If true, creates sql migration, otherwise js.
   * @return {MigrationInfo}
   */
  create({ stamp = `${Math.floor(Date.now() / 1000)}`, text, sql = true }) {
    let base = text ? `${stamp}_${text}` : stamp;
    let fname = null;
    let content = null;
    if (sql) {
      fname = `${base}.sql`;
      content = [
        `-- INSERT INTO migrations(stamp) VALUES('${stamp}');`
      ].join('\n');
    } else {
      fname = `${base}.js`;
      content = [
        'export default async function (db) {',
        '  await db.query(\'SELECT 1;\');',
        '}'
      ].join('\n');
    }
    let path = `${this.root}/${fname}`;
    fs.writeFileSync(path, content);
    return new MigrationInfo({ status: 'created', stamp, text, path });
  }

  /**
   * Get database migrations.
   * @return {async Array}
   */
  async dbDefs() {
    return this.db.query('SELECT * FROM migrations ORDER BY stamp ASC;', { type: Sequelize.QueryTypes.SELECT });
  }

  /**
   * Check migration status.
   * @param {String} stamp
   * @return {async Date} Timestamp when migration has been performed, null otherwise.
   */
  async markedAt(stamp) {
    const rows = await this.db.query('SELECT created_at FROM migrations WHERE stamp = :stamp;', {
      replacements: { stamp },
      type: Sequelize.QueryTypes.SELECT
    });
    return _.get(rows, '[0].created_at');
  }

  /**
   * Mark migration as performed.
   * @param {String} stamp
   * @return {async Date} Migration created at timestamp.
   */
  async mark(stamp) {
    let [ { created_at: createdAt } ] = await this.db.query(
      'INSERT INTO migrations(stamp, created_at) VALUES(:stamp, NOW()) RETURNING created_at;', {
        replacements: { stamp },
        type: Sequelize.QueryTypes.INSERT
      }
    );
    return createdAt;
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
    let r = [];

    const push = function (options) {
      r.push(new MigrationInfo(options));
    };

    const pushMigrated = (local, remote) => {
      push({ status: 'migrated', stamp: local.stamp, text: local.text, migratedAt: remote['created_at'] });
    };

    const pushPending = (local) => {
      push({ status: 'pending', stamp: local.stamp, text: local.text });
    };

    const pushUnknown = (remote) => {
      push({ status: 'unknown', stamp: remote.stamp, migratedAt: remote['created_at'] });
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
    let def = _.find(this.defs, { stamp });
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
        throw new TypeError(`Unknown migration type, expected js or sql definitions.`);
    }

    migratedAt = await this.mark(stamp);

    return new MigrationInfo({ status: 'migrated', stamp, text: def.text, migratedAt });
  }

}