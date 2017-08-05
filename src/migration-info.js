
const _ = require('lodash');
const sprintf = require('sprintf');
const chalk = require('chalk');

/**
 * Represents single migration.
 */
class MigrationInfo {

  constructor({ stamp, status, text = null, migratedAt = null, path = null } = {}) {
    _.assign(this, { stamp, status, text, migratedAt, path });
  }

  /**
   * Colored line for migration.
   * @return {string}
   */
  coloredLine() {
    const line = _.compact([
      new Date().toISOString(),
      this.stamp,
      sprintf('%8s', this.status),
      this.text,
      this.migratedAt ? `(migrated ${this.migratedAt})` : null,
      this.path ? `(${this.path})` : null
    ]).join(' ');
    const color = MigrationInfo.statusColors[this.status];
    if (!color) {
      throw new TypeError(
        `Unknown status ${this.status}, expected one of ${_.keys(MigrationInfo.statusColors).join(', ')}.`
      );
    }
    return chalk[color](line);
  }
}

MigrationInfo.statusColors = {
  created: 'green',
  migrated: 'green',
  pending: 'yellow',
  unknown: 'red',
  error: 'red'
};

module.exports = MigrationInfo;
