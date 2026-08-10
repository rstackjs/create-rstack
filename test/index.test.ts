import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { expect, test } from 'rstack/test';
import {
  checkCancel,
  create,
  isNpmTemplate,
  multiselect,
  resolveCustomTemplate,
  resolveNpmTemplate,
  sanitizeCacheKey,
  select,
  text,
} from '../dist/index.js';
import * as publicApi from '../src';

test('should export public APIs', () => {
  expect(typeof checkCancel).toBe('function');
  expect(typeof create).toBe('function');
  expect(typeof multiselect).toBe('function');
  expect(typeof select).toBe('function');
  expect(typeof text).toBe('function');
});

test('should expose selected clack prompt helpers from src entrypoint', () => {
  expect(publicApi.autocomplete).toBe(promptsActual.autocomplete);
  expect(publicApi.multiselect).toBe(promptsActual.multiselect);
  expect(publicApi.groupMultiselect).toBe(promptsActual.groupMultiselect);
});

test('should export npm template utilities', () => {
  expect(typeof isNpmTemplate).toBe('function');
  expect(typeof resolveCustomTemplate).toBe('function');
  expect(typeof resolveNpmTemplate).toBe('function');
  expect(typeof sanitizeCacheKey).toBe('function');
});

test('should detect npm templates correctly', () => {
  // npm: prefix
  expect(isNpmTemplate('npm:my-package')).toBe(true);
  expect(isNpmTemplate('npm:@scope/package')).toBe(true);

  // Scoped packages
  expect(isNpmTemplate('@scope/package')).toBe(true);

  // Pure package names
  expect(isNpmTemplate('my-package')).toBe(true);
  expect(isNpmTemplate('my-package-name')).toBe(true);

  // Not npm templates
  expect(isNpmTemplate('./local-path')).toBe(false);
  expect(isNpmTemplate('../relative-path')).toBe(false);
  expect(isNpmTemplate('github:user/repo')).toBe(false);
  expect(isNpmTemplate('https://example.com')).toBe(false);
  expect(isNpmTemplate('/absolute/path')).toBe(false);
});

test('should sanitize cache keys correctly', () => {
  expect(sanitizeCacheKey('my-package', '1.0.0')).toBe('my-package@1.0.0');
  expect(sanitizeCacheKey('@scope/package', 'latest')).toBe(
    '@scope/package@latest',
  );
  expect(sanitizeCacheKey('my-package', '')).toBe('my-package@latest');
  expect(sanitizeCacheKey('my/package', '1.0.0')).toBe('my_package@1.0.0');
});
