import { access, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const webModules = resolve('node_modules');
const sharedModules = resolve('..', 'node_modules');
await access(webModules);
try {
  await access(sharedModules);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // Shared app Auth sources resolve packages from the repository root.
  await symlink(webModules, sharedModules, 'junction');
}
