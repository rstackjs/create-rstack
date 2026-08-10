import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'basic');
const testDir = path.join(fixturesDir, 'test-temp-output');

const mocks = rs.hoisted(() => {
  const state = {
    xCalls: [] as Array<{
      command: string;
      args: string[];
      options: unknown;
    }>,
  };

  return {
    state,
    x: rs.fn(async (command: string, args: string[], options: unknown) => {
      state.xCalls.push({ command, args, options });
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
      // rslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    // rslint-disable-next-line @typescript-eslint/no-explicit-any
    xSync: rs.fn(() => ({ stdout: 'true\n', stderr: '', exitCode: 0 })) as any,
  };
});

rs.mock('tinyexec', () => ({
  x: mocks.x,
  xSync: mocks.xSync,
}));

beforeEach(() => {
  mocks.state.xCalls.length = 0;
  rs.mocked(mocks.x).mockReset();
  rs.mocked(mocks.x).mockImplementation(
    async (command: string, args: string[], options: unknown) => {
      mocks.state.xCalls.push({ command, args, options });
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
    },
  );

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

test('should run extra tool action', async () => {
  const projectDir = path.join(testDir, 'extra-tool-action');
  let actionCalled = false;

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'custom-action',
        label: 'Custom Action',
        action: ({ templateName, distFolder }) => {
          expect(templateName).toBe('vanilla');
          expect(distFolder).toBe(projectDir);
          actionCalled = true;
        },
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--tools',
      'custom-action',
    ],
  });

  expect(actionCalled).toBe(true);
});

test('should run extra tool command', async () => {
  const projectDir = path.join(testDir, 'extra-tool-command');
  const testFile = path.join(__dirname, 'node_modules', 'test.txt');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'custom-command',
        label: 'Custom Command',
        command: `npx rimraf ${testFile}`,
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--tools',
      'custom-command',
    ],
  });

  expect(mocks.state.xCalls).toEqual([
    {
      command: `npx rimraf ${testFile}`,
      args: [],
      options: expect.objectContaining({
        nodeOptions: expect.objectContaining({
          cwd: projectDir,
          shell: true,
          stdio: 'inherit',
        }),
      }),
    },
  ]);
});

test('should preserve quoted extra tool command arguments', async () => {
  const projectDir = path.join(testDir, 'extra-tool-quoted-command');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'quoted-command',
        label: 'Quoted Command',
        command: 'npx some-tool --name "my app" --flag',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--tools',
      'quoted-command',
    ],
  });

  expect(mocks.state.xCalls).toContainEqual({
    command: 'npx some-tool --name "my app" --flag',
    args: [],
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        shell: true,
        stdio: 'inherit',
      }),
    }),
  });
});

test('should fail when extra tool command exits non-zero', async () => {
  const projectDir = path.join(testDir, 'extra-tool-command-failure');

  rs.mocked(mocks.x).mockImplementation(
    async (command: string, args: string[], options: unknown) => {
      mocks.state.xCalls.push({ command, args, options });
      return {
        stdout: '',
        stderr: 'tool failed',
        exitCode: 1,
      };
    },
  );

  await expect(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraTools: [
        {
          value: 'failing-command',
          label: 'Failing Command',
          command: 'npx broken-tool',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--tools',
        'failing-command',
      ],
    }),
  ).rejects.toThrow('Failed to run command: npx broken-tool');
});

test('should filter extra tools based on template name', async () => {
  const projectDir = path.join(testDir, 'extra-tool-filter');
  let filteredToolCalled = false;
  let allowedToolCalled = false;
  let noFilterToolCalled = false;

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'filtered-tool',
        label: 'Filtered Tool',
        // This tool should be filtered out for 'vanilla' template
        when: ({ templateName }) => templateName !== 'vanilla',
        action: () => {
          filteredToolCalled = true;
        },
      },
      {
        value: 'allowed-tool',
        label: 'Allowed Tool',
        // This tool should be allowed for 'vanilla' template
        when: ({ templateName }) => templateName === 'vanilla',
        action: () => {
          allowedToolCalled = true;
        },
      },
      {
        value: 'no-filter-tool',
        label: 'No Filter Tool',
        // No `when` property - should always be available
        action: () => {
          noFilterToolCalled = true;
        },
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--tools',
      'filtered-tool,allowed-tool,no-filter-tool',
    ],
  });

  // filtered-tool should not run because `when` returns false
  expect(filteredToolCalled).toBe(false);
  // allowed-tool should run because `when` returns true
  expect(allowedToolCalled).toBe(true);
  // no-filter-tool should run because it has no `when`
  expect(noFilterToolCalled).toBe(true);
});

test('should keep extra tools when built-in tools are disabled', async () => {
  const projectDir = path.join(testDir, 'extra-tool-without-builtin-tools');
  let actionCalled = false;

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    builtinTools: [],
    extraTools: [
      {
        value: 'custom-action',
        label: 'Custom Action',
        action: () => {
          actionCalled = true;
        },
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--tools',
      'eslint,custom-action',
    ],
  });

  expect(actionCalled).toBe(true);
  expect(fs.existsSync(path.join(projectDir, 'eslint.config.mjs'))).toBe(false);
});
