import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(
  readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'),
);
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

describe('release metadata', () => {
  it('declares a semver version in package.json', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the package-lock.json root versions in sync with package.json', () => {
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('documents the installer download in the README', () => {
    expect(readme).toContain('https://github.com/jlozanoDev/passBox/releases');
    expect(readme).toContain('Setup.exe');
  });
});
