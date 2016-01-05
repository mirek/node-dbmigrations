
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const ajv = new Ajv();
const root = `${__dirname}/../schemas`;

// Load schema definitions.
for (let name of fs.readdirSync(root)) {
  ajv.addSchema(JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8')), path.basename(name, '.schema.json'));
}

/**
 * Make sure provided json conforms to provided schema.
 * @param {string} name Schema name.
 * @param {any} json
 * @return {any} Provided json.
 * @throws Error if provided json doesn't conform to the schema.
 */
export function assert(name, json) {
  if (!ajv.validate(name, json)) {
    throw new Error(ajv.errorsText());
  }
  return json;
}
