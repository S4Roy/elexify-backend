import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('src/routes/admin');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
describe('admin route permission coverage', () => {
  it('requires an explicit gate on every registered admin endpoint except current identity', () => {
    const missing = [];
    for (const file of files(root).filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))) {
      const text = fs.readFileSync(file, 'utf8');
      const routes = [...text.matchAll(/\w+Router\.(get|post|put|patch|delete)\(\s*(['"])(.*?)\2\s*,/gs)];
      routes.forEach((route, index) => {
        const body = text.slice(route.index + route[0].length, routes[index + 1]?.index || text.length);
        if (file.endsWith('/role.js') && route[3] === '/me') return;
        if (!/require(?:Any)?Permission\(|requireOperationPermission\(|requireDataView|requireOperationHistoryView|\b(view|manage|configure|guard)\s*,/.test(body)) missing.push(`${path.relative(root, file)} ${route[1]} ${route[3]}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
