/* eslint-disable no-process-env */

import pgpass from 'pgpass';
import url from 'url';

// Maybe decorate url with password from `~/.pgpass`.
export default async function (a) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(a);
      const [ user, pass ] = typeof parsed.auth === 'string' ? parsed.auth.split(':') : [ process.env.USER, null ];
      if (pass == null) {
        pgpass({
          host: parsed.host,
          port: parsed.port,
          database: parsed.pathname.substring(1),
          user
        }, (pass_) => {
          if (pass_) {
            parsed.auth = `${user}:${pass_}`;
            resolve(url.format(parsed));
          } else {
            resolve(a);
          }
        });
      } else {

        // There is a password already provided in the url.
        resolve(a);
      }
    } catch (err) {
      reject(err);
    }
  });
}
