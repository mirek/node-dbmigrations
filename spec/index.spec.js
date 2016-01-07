/* eslint-disable no-unused-expressions */

import fs from 'fs-extra';
import glob from 'glob';
import cli from '../lib/cli';
import chai from 'chai';

const { expect } = chai;

describe('dbmigrations', function () {

  before(function () {
    process.chdir(`${__dirname}/index`);
    fs.emptyDirSync('migrations');
  });

  it('should create sql migration', async function () {
    expect(glob.sync('migrations/*_foo.sql').length).to.eq(0);
    await cli([ 'create', '--name', 'foo' ]);
    expect(glob.sync('migrations/*_foo.sql').length).to.eq(1);
  });

  it('should create js migration', async function () {
    expect(glob.sync('migrations/*_bar.js').length).to.eq(0);
    await cli([ 'create', '--js', '--name', 'bar' ]);
    expect(glob.sync('migrations/*_bar.js').length).to.eq(1);
  });

});
