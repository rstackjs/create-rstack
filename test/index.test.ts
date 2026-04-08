import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { expect, test } from '@rstest/core';
import {
  checkCancel,
  create,
  multiselect,
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
