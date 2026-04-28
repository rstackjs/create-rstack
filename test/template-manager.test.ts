import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test } from '@rstest/core';
import {
  isNpmTemplate,
  resolveCustomTemplate,
  resolveNpmTemplate,
  sanitizeCacheKey,
} from '../src/template-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'fixtures', 'template-manager-test');

beforeEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  return () => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  };
});

test('should reject invalid package names', () => {
  expect(() =>
    resolveNpmTemplate('foo;echo hi', undefined, { cacheDir: testDir }),
  ).toThrow('Invalid npm package name');
  expect(() =>
    resolveNpmTemplate('$(whoami)', undefined, { cacheDir: testDir }),
  ).toThrow('Invalid npm package name');
  expect(() =>
    resolveNpmTemplate('foo bar', undefined, { cacheDir: testDir }),
  ).toThrow('Invalid npm package name');
});

test('should reject invalid version specifiers', () => {
  expect(() =>
    resolveNpmTemplate('my-pkg', '1.0.0;echo hi', { cacheDir: testDir }),
  ).toThrow('Invalid version specifier');
  expect(() =>
    resolveNpmTemplate('my-pkg', '$(whoami)', { cacheDir: testDir }),
  ).toThrow('Invalid version specifier');
});

test('resolveCustomTemplate should strip npm: prefix and delegate', () => {
  // npm: prefix with invalid name still triggers validation
  expect(() =>
    resolveCustomTemplate('npm:$(bad)', undefined, { cacheDir: testDir }),
  ).toThrow('Invalid npm package name');
});

test('resolveCustomTemplate should return local paths as-is', () => {
  expect(resolveCustomTemplate('./local-path')).toBe('./local-path');
  expect(resolveCustomTemplate('../relative')).toBe('../relative');
  expect(resolveCustomTemplate('/absolute/path')).toBe('/absolute/path');
  expect(resolveCustomTemplate('github:user/repo')).toBe('github:user/repo');
});

test('should reuse cache for pinned versions', () => {
  const cacheKey = sanitizeCacheKey('my-pkg', '1.0.0');
  const templateDir = path.join(testDir, '.temp-templates', cacheKey);

  // Pre-populate cache
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'package.json'), '{}');

  // Should return cached path without calling npm install
  const result = resolveNpmTemplate('my-pkg', '1.0.0', { cacheDir: testDir });
  expect(result).toBe(templateDir);
});

test('should not reuse cache for latest version', () => {
  const cacheKey = sanitizeCacheKey('nonexistent-pkg-12345', 'latest');
  const templateDir = path.join(testDir, '.temp-templates', cacheKey);

  // Pre-populate cache
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, 'package.json'), '{}');

  // latest should try to reinstall (and fail for nonexistent package)
  expect(() =>
    resolveNpmTemplate('nonexistent-pkg-12345', undefined, {
      cacheDir: testDir,
    }),
  ).toThrow('Failed to install');
});
