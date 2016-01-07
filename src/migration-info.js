
import _ from 'lodash';
import sprintf from 'sprintf';
import chalk from 'chalk';

/**
 * Represents single migration.
 */
export default class MigrationInfo {

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

module.exports = MigrationInfo;
