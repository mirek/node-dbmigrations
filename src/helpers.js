
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const schema = require('./schema');

function dotfile(root = '.', name = '.dbmigrations.json') {
  let p = root;
  while (p) {
    const r = path.resolve(p, name);
    if (fs.existsSync(r)) {
      return schema.assert('dbmigrations', JSON.parse(fs.readFileSync(r, { encoding: 'utf8' })));
    }
    const c = path.dirname(path.resolve(p));
    p = p === c ? null : c;
  }
  return null;
}

function template(basename, locals, options) {
  const raw = fs.readFileSync(path.join(__dirname, '../templates', `${basename}.ejs`), { encoding: 'utf8' });
  return ejs.render(raw, locals, options);
}

module.exports = {
  dotfile,
  template
};
