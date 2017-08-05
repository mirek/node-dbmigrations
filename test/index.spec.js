
const fs = require('fs-extra');
const glob = require('glob');
const cli = require('../src/cli');
const chai = require('chai');

const { expect } = chai;

const log = function () {};

describe('dbmigrations', function () {

  before(function () {
    process.chdir(`${__dirname}/index`);
    fs.emptyDirSync('migrations');
  });

  it('should create sql migration', async function () {
    expect(glob.sync('migrations/*_foo.sql').length).to.eq(0);
    await cli([ 'create', '--name', 'foo' ], { log });
    expect(glob.sync('migrations/*_foo.sql').length).to.eq(1);
  });

  it('should create js migration', async function () {
    expect(glob.sync('migrations/*_bar.js').length).to.eq(0);
    await cli([ 'create', '--js', '--name', 'bar' ], { log });
    expect(glob.sync('migrations/*_bar.js').length).to.eq(1);
  });

});
