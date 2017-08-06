const url = require('url');
const pg = require('pg');
const _ = require('lodash');

// Utility function that maps underscored records into camel cased objects.
function camelCase(a) {
  if (_.isObject(a)) {
    return _.mapKeys(a, (v, k) => _.camelCase(k));
  }
  return a;
}

// Utility which transparently handles pg.sql`...` style templates.
function demangle(args) {
  if (args.length === 1) {
    const arg = args[0];
    if (_.isArray(arg) && _.isString(arg[0]) && _.isArray(arg[1])) {
      return arg;
    }
  }
  return args;
}

// TODO: Double check this parsing.
function parse(url_) {
  const params = url.parse(url_);
  const auth = params.auth ? params.auth.split(':') : null;
  return {
    user: auth ? auth[0] : null,
    password: auth ? auth[1] : null,
    host: params.hostname,
    port: params.port,
    database: params.pathname.split('/')[1]
    // ssl: true FIXME: read from query param
  };
}

class Db {

  constructor(url) {
    this.pool = new pg.Pool(parse(url));
  }

  async query(...args) {
    return await this.pool.query(...demangle(args));
  }

  // Get rows from query result.
  async rows(...args) {
    const r = await this.query(...args);
    return _.has(r, 'rows') ? r.rows.map(camelCase) : [];
  }

  // Get single row from query result.
  async row(...args) {
    const r = await this.query(...args);
    if (_.get(r, 'rowCount') > 0) {
      return camelCase(r.rows[0]);
    }
    return null;
  }

  // Get single value from query result.
  async value(...args) {
    const r = await this.query(...args);
    if (_.get(r, 'rowCount') > 0) {
      return r.rows[0][r.fields[0].name];
    }
    return null;
  }

  async close() {
    await this.pool.end();
  }

}

module.exports = Db;
