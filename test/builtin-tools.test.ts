import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from 'rstack/test';
import { create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'basic');
const testDir = path.join(fixturesDir, 'test-temp-output-builtin-tools');

type PromptOption = {
  value: string;
  label?: string;
  hint?: string;
};

const mocks = rs.hoisted(() => {
  const state = {
    toolPromptCount: 0,
    toolPromptOptions: [] as PromptOption[],
  };

  const multiselect = rs.fn(
    async (options: {
      message?: string;
      options?: Array<{ value: unknown; label?: string; hint?: string }>;
    }) => {
      if (options.message?.includes('Select additional tools')) {
        state.toolPromptCount += 1;
        state.toolPromptOptions = (options.options ?? []) as PromptOption[];
      }
      return [];
    },
  ) as typeof promptsActual.multiselect;

  return { state, multiselect };
});

rs.mock('@clack/prompts', () => ({
  ...promptsActual,
  multiselect: mocks.multiselect,
}));

beforeEach(() => {
  mocks.state.toolPromptCount = 0;
  mocks.state.toolPromptOptions.length = 0;
  rs.mocked(mocks.multiselect).mockClear();

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

test('should skip tools prompt when built-in tools are disabled', async () => {
  const projectDir = path.join(testDir, 'no-tools');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    builtinTools: [],
    argv: ['node', 'test', '--dir', projectDir],
  });

  expect(mocks.state.toolPromptCount).toBe(0);
});

test('should keep extra tools in the prompt when built-in tools are disabled', async () => {
  const projectDir = path.join(testDir, 'extra-tools');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    builtinTools: [],
    extraTools: [{ value: 'custom-tool', label: 'Custom Tool' }],
    argv: ['node', 'test', '--dir', projectDir],
  });

  expect(mocks.state.toolPromptCount).toBe(1);
  expect(mocks.state.toolPromptOptions).toEqual([
    { value: 'custom-tool', label: 'Custom Tool', hint: undefined },
  ]);
});

test('should only show configured built-in tools', async () => {
  const projectDir = path.join(testDir, 'selected-tools');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    builtinTools: ['rslint', 'prettier'],
    argv: ['node', 'test', '--dir', projectDir],
  });

  expect(mocks.state.toolPromptOptions).toEqual([
    { value: 'rslint', label: 'Rslint - linting' },
    { value: 'prettier', label: 'Prettier - formatting' },
  ]);
});
