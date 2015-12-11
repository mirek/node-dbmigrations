
import path from 'path';
import fs from 'fs';

export function dotfile(root = '.', name = '.dbmigrations.json') {
  let p = root;
  while (p) {
    let r = path.resolve(p, name);
    if (fs.existsSync(r)) {
      return JSON.parse(fs.readFileSync(r, { encoding: 'utf8' }));
    }
    const c = path.dirname(path.resolve(p));
    p = p === c ? null : c;
  }
  return null;
}
