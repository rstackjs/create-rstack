import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from 'rstack/test';
import { color } from 'rslog';
import { create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'basic');
const testDir = path.join(fixturesDir, 'test-temp-output-skills');

type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type StreamingExecResult = {
  result: ExecResult;
  lines?: string[];
};

const mocks = rs.hoisted(() => {
  type ExecCall = {
    command: string;
    args: string[];
    options: unknown;
  };

  type TaskLogEvent = string;

  const state = {
    xCalls: [] as ExecCall[],
    taskLogEvents: [] as TaskLogEvent[],
    commandLogs: [] as string[],
    promptOptions: [] as Array<{
      value: string;
      label?: string;
      hint?: string;
    }>,
  };

  function createExecStream(result: ExecResult, lines: string[] = []) {
    const promise = Promise.resolve(result);

    return {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
      async *[Symbol.asyncIterator]() {
        for (const line of lines) {
          await Promise.resolve();
          yield line;
        }
      },
    };
  }

  const x = rs.fn((command: string, args: string[], options: unknown) => {
    state.xCalls.push({ command, args, options });
    return createExecStream({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    // rslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const xSync = rs.fn((command: string, args: string[], options: unknown) => {
    return {
      stdout: 'true\n',
      stderr: '',
      exitCode: 0,
    };
    // rslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  const spinner = (() => ({
    start: () => {},
    stop: () => {},
    cancel: () => {},
    error: () => {},
    message: () => {},
    clear: () => {},
    isCancelled: false,
  })) as typeof promptsActual.spinner;

  const taskLog = (({ title }: { title: string }) => ({
    message: (message?: string) => {
      state.taskLogEvents.push(`message:${title}:${message ?? ''}`);
    },
    success: (message?: string) => {
      state.taskLogEvents.push(`success:${title}:${message ?? ''}`);
    },
    error: (message?: string) => {
      state.taskLogEvents.push(`error:${title}:${message ?? ''}`);
    },
    group: () => {},
  })) as typeof promptsActual.taskLog;

  const createTaskLog = ({ title }: { title: string }) => {
    state.taskLogEvents.push(`create:${title}`);
    return taskLog({ title });
  };

  const multiselect = rs.fn(
    async (options: {
      message?: string;
      options?: Array<{ value: unknown; label?: string; hint?: string }>;
    }) => {
      if (options.message?.includes('Select optional skills')) {
        state.promptOptions = (options.options ?? []) as Array<{
          value: string;
          label?: string;
          hint?: string;
        }>;
      }
      return [];
    },
  ) as typeof promptsActual.multiselect;

  return {
    state,
    x,
    xSync,
    spinner,
    taskLog: createTaskLog,
    multiselect,
    createExecStream,
  };
});

rs.mock('tinyexec', () => ({
  x: mocks.x,
  xSync: mocks.xSync,
}));

rs.mock('@clack/prompts', () => ({
  ...promptsActual,
  multiselect: mocks.multiselect,
  spinner: mocks.spinner,
  taskLog: mocks.taskLog,
  log: {
    ...promptsActual.log,
    info: (message: string) => {
      mocks.state.commandLogs.push(message);
    },
  },
}));

beforeEach(() => {
  mocks.state.xCalls.length = 0;
  mocks.state.taskLogEvents.length = 0;
  mocks.state.commandLogs.length = 0;
  mocks.state.promptOptions.length = 0;
  rs.mocked(mocks.x).mockReset();
  rs.mocked(mocks.x).mockImplementation(
    (command: string, args: string[], options: unknown) => {
      mocks.state.xCalls.push({ command, args, options });
      return mocks.createExecStream({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    },
  );
  rs.mocked(mocks.multiselect).mockReset();
  rs.mocked(mocks.multiselect).mockImplementation(async (options) => {
    if (options.message?.includes('Select optional skills')) {
      mocks.state.promptOptions = (options.options ?? []) as Array<{
        value: string;
        label?: string;
        hint?: string;
      }>;
    }
    return [];
  });

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

function createExecCommand(
  handler?: (context: {
    command: string;
    args: string[];
    options: unknown;
  }) =>
    | Promise<ExecResult | StreamingExecResult>
    | ExecResult
    | StreamingExecResult,
) {
  rs.mocked(mocks.x).mockImplementation(
    (command: string, args: string[], options: unknown) => {
      mocks.state.xCalls.push({ command, args, options });
      if (handler) {
        const output = handler({ command, args, options });
        if ('then' in Object(output)) {
          const promise = Promise.resolve(output).then((resolvedOutput) =>
            'result' in resolvedOutput
              ? mocks.createExecStream(
                  resolvedOutput.result,
                  resolvedOutput.lines,
                )
              : mocks.createExecStream(resolvedOutput),
          );

          return {
            then: promise.then.bind(promise),
            catch: promise.catch.bind(promise),
            finally: promise.finally.bind(promise),
            async *[Symbol.asyncIterator]() {
              const resolvedOutput = await output;
              const stream =
                'result' in resolvedOutput
                  ? mocks.createExecStream(
                      resolvedOutput.result,
                      resolvedOutput.lines,
                    )
                  : mocks.createExecStream(resolvedOutput);
              for await (const line of stream) {
                yield line;
              }
            },
          };
        }
        if ('result' in output) {
          return mocks.createExecStream(output.result, output.lines);
        }
        return mocks.createExecStream(output);
      }
      return mocks.createExecStream({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
    },
  );
  return mocks.state.xCalls;
}

async function getCreateError(action: Promise<unknown>) {
  try {
    await action;
  } catch (error) {
    return error;
  }

  throw new Error('Expected create() to throw');
}

test('should batch selected same-source extra skills from comma separated --skill option into a single install', async () => {
  const projectDir = path.join(testDir, 'skills-comma-separated-same-source');
  const calls = createExecCommand();
  const taskLogEvents = mocks.state.taskLogEvents;
  const commandLogs = mocks.state.commandLogs;

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'rstest-best-practices',
        label: 'Rstest Best Practices',
        source: 'rstackjs/agent-skills',
      },
      {
        value: 'rsbuild-best-practices',
        label: 'Rsbuild Best Practices',
        source: 'rstackjs/agent-skills',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'rstest-best-practices,rsbuild-best-practices',
    ],
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'rstackjs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'rstest-best-practices',
      '--skill',
      'rsbuild-best-practices',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(taskLogEvents).toEqual([
    'create:Installing skills rstest-best-practices, rsbuild-best-practices',
    'success:Installing skills rstest-best-practices, rsbuild-best-practices:Installed skills rstest-best-practices, rsbuild-best-practices',
  ]);
  expect(commandLogs).toContain(
    `Running skill install command: ${color.dim('npx -y skills add rstackjs/agent-skills --agent universal --yes --copy --skill rstest-best-practices --skill rsbuild-best-practices')}`,
  );
});

test('should install selected extra skills from comma separated --skill option across different sources', async () => {
  const projectDir = path.join(testDir, 'skills-comma-separated');
  const calls = createExecCommand();
  const taskLogEvents = mocks.state.taskLogEvents;
  const commandLogs = mocks.state.commandLogs;

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'git-url',
        label: 'Git URL',
        source: 'vercel-labs/agent-skills',
      },
      {
        value: 'docs-writer',
        label: 'Docs Writer',
        source: 'acme/skills',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'git-url,docs-writer',
    ],
  });

  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'vercel-labs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'git-url',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(calls[1]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs-writer',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(taskLogEvents).toEqual([
    'create:Installing skill git-url',
    'success:Installing skill git-url:Installed skill git-url',
    'create:Installing skill docs-writer',
    'success:Installing skill docs-writer:Installed skill docs-writer',
  ]);
  expect(commandLogs).toContain(
    `Running skill install command: ${color.dim('npx -y skills add vercel-labs/agent-skills --agent universal --yes --copy --skill git-url')}`,
  );
  expect(commandLogs).toContain(
    `Running skill install command: ${color.dim('npx -y skills add acme/skills --agent universal --yes --copy --skill docs-writer')}`,
  );
});

test('should install selected extra skills from repeated --skill flags', async () => {
  const projectDir = path.join(testDir, 'skills-repeated-flags');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'git-url',
        label: 'Git URL',
        source: 'vercel-labs/agent-skills',
      },
      {
        value: 'docs-writer',
        label: 'Docs Writer',
        source: 'acme/skills',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'git-url',
      '--skill',
      'docs-writer',
    ],
  });

  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'vercel-labs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'git-url',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(calls[1]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs-writer',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should preserve skill install order when the same source appears non-contiguously', async () => {
  const projectDir = path.join(testDir, 'skills-preserve-order');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'rstest-best-practices',
        label: 'Rstest Best Practices',
        source: 'rstackjs/agent-skills',
      },
      {
        value: 'docs-writer',
        label: 'Docs Writer',
        source: 'acme/skills',
      },
      {
        value: 'rsbuild-best-practices',
        label: 'Rsbuild Best Practices',
        source: 'rstackjs/agent-skills',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'rstest-best-practices,docs-writer,rsbuild-best-practices',
    ],
  });

  expect(calls).toHaveLength(3);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'rstackjs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'rstest-best-practices',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(calls[1]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs-writer',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(calls[2]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'rstackjs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'rsbuild-best-practices',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should skip the skills prompt when --skill is provided', async () => {
  const projectDir = path.join(testDir, 'skills-skip-prompt-with-cli-option');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'git-url',
        label: 'Git URL',
        source: 'vercel-labs/agent-skills',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'git-url',
    ],
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'vercel-labs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'git-url',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should skip skill installation when --dir and --template are used without --skill', async () => {
  const projectDir = path.join(testDir, 'skills-non-interactive-no-skill');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'git-url',
        label: 'Git URL',
        source: 'vercel-labs/agent-skills',
      },
    ],
    argv: ['node', 'test', '--dir', projectDir, '--template', 'vanilla'],
  });

  expect(calls).toHaveLength(0);
});

test('should prove --skill skips the skills prompt even without --dir and --template', async () => {
  const calls = createExecCommand();
  let skillsPromptReached = false;
  const projectDir = path.join(testDir, 'skills-skip-proof');
  const guardedSkillPrompt = async ({ message }: { message?: string }) => {
    if (message?.includes('Select optional skills')) {
      skillsPromptReached = true;
      throw new Error('skills prompt should not be reached');
    }
    return [];
  };
  rs.mocked(mocks.multiselect).mockImplementation(
    guardedSkillPrompt as typeof mocks.multiselect,
  );

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'git-url',
        label: 'Git URL',
        source: 'vercel-labs/agent-skills',
      },
    ],
    argv: ['node', 'test', projectDir, '--tools', '', '--skill', 'git-url'],
  });

  expect(skillsPromptReached).toBe(false);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'vercel-labs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'git-url',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should honor explicit --skill values even when they are hidden by template gating', async () => {
  const projectDir = path.join(testDir, 'skills-template-filtering');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla', 'react'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'react-docs',
        label: 'React Docs',
        source: 'acme/skills',
        skill: 'docs/react',
        when: ({ templateName }) => templateName === 'react',
      },
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
        skill: 'docs/shared',
        when: ({ templateName }) => templateName === 'vanilla',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'react-docs,shared-docs',
    ],
  });

  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs/react',
      '--skill',
      'docs/shared',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should show tool-gated skills in the prompt when the required tool is selected', async () => {
  const projectDir = path.join(testDir, 'skills-tools-filtering-prompt');

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'rstest',
        label: 'Rstest',
      },
    ],
    extraSkills: [
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
      },
      {
        value: 'rstest-best-practices',
        label: 'Rstest Best Practices',
        source: 'rstackjs/agent-skills',
        when: ({ tools }) => tools.includes('rstest'),
      },
    ],
    argv: ['node', 'test', projectDir, '--tools', 'rstest'],
  });

  expect(mocks.state.promptOptions).toEqual([
    {
      value: 'shared-docs',
      label: 'Shared Docs',
      hint: 'acme/skills',
    },
    {
      value: 'rstest-best-practices',
      label: 'Rstest Best Practices',
      hint: 'rstackjs/agent-skills',
    },
  ]);
});

test('should honor explicit --skill values even when the required tool is not selected', async () => {
  const projectDir = path.join(testDir, 'skills-tools-filtering-cli');
  const calls = createExecCommand();

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraTools: [
      {
        value: 'rstest',
        label: 'Rstest',
      },
    ],
    extraSkills: [
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
        skill: 'docs/shared',
      },
      {
        value: 'rstest-best-practices',
        label: 'Rstest Best Practices',
        source: 'rstackjs/agent-skills',
        when: ({ tools }) => tools.includes('rstest'),
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
      'biome',
      '--skill',
      'rstest-best-practices,shared-docs',
    ],
  });

  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'rstackjs/agent-skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'rstest-best-practices',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
  expect(calls[1]).toEqual({
    args: [
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs/shared',
    ],
    command: 'npx',
    options: expect.objectContaining({
      nodeOptions: expect.objectContaining({
        cwd: projectDir,
        stdio: 'pipe',
      }),
    }),
  });
});

test('should throw the install command context when installation fails', async () => {
  const projectDir = path.join(testDir, 'skills-install-failure');
  createExecCommand(() => {
    return {
      stdout: '',
      stderr: 'install failed',
      exitCode: 1,
    };
  });

  const error = await getCreateError(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'shared-docs',
          label: 'Shared Docs',
          source: 'acme/skills',
          skill: 'docs/shared',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--skill',
        'shared-docs',
      ],
    }),
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(
    'Failed to install skill "shared-docs" from "acme/skills" using command: npx -y skills add acme/skills --agent universal --yes --copy --skill docs/shared',
  );
});

test('should throw grouped install command context when batched installation fails', async () => {
  const projectDir = path.join(testDir, 'skills-batched-install-failure');
  createExecCommand(() => {
    return {
      stdout: '',
      stderr: 'install failed',
      exitCode: 1,
    };
  });

  const error = await getCreateError(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'rstest-best-practices',
          label: 'Rstest Best Practices',
          source: 'rstackjs/agent-skills',
        },
        {
          value: 'rsbuild-best-practices',
          label: 'Rsbuild Best Practices',
          source: 'rstackjs/agent-skills',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--skill',
        'rstest-best-practices,rsbuild-best-practices',
      ],
    }),
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(
    'Failed to install skills "rstest-best-practices", "rsbuild-best-practices" from "rstackjs/agent-skills" using command: npx -y skills add rstackjs/agent-skills --agent universal --yes --copy --skill rstest-best-practices --skill rsbuild-best-practices',
  );
});

test('should omit noisy skills cli output from install errors', async () => {
  const projectDir = path.join(testDir, 'skills-install-noisy-error');
  const rawStdout = `███████╗██╗  ██╗██╗██╗     ██╗     ███████╗
┌   skills
│
│  Tip: use the --yes (-y) and --global (-g) flags to install without prompts.
│
◇  Source: https://github.com/vercel-labs/agent-skills.git
│
◇  Repository cloned
│
◇  Found 6 skills
│
■  No matching skills found for: non-existent-skill`;
  createExecCommand(() => ({
    stdout: rawStdout,
    stderr: '',
    exitCode: 1,
  }));

  const error = await getCreateError(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'missing-skill',
          label: 'Missing Skill',
          source: 'vercel-labs/agent-skills',
          skill: 'non-existent-skill',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--skill',
        'missing-skill',
      ],
    }),
  );

  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(
    message.match(/Failed to install skill "missing-skill"/g)?.length ?? 0,
  ).toBe(1);
  expect(message).toContain(
    'Failed to install skill "missing-skill" from "vercel-labs/agent-skills" using command: npx -y skills add vercel-labs/agent-skills --agent universal --yes --copy --skill non-existent-skill',
  );
  expect(message).not.toContain(rawStdout);
});

test('should include spawn errors when skill installation cannot start', async () => {
  const projectDir = path.join(testDir, 'skills-install-spawn-error');
  createExecCommand(({ command, args, options }) => {
    expect(command).toBe('npx');
    expect(args).toEqual([
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs/shared',
    ]);
    expect(options).toEqual(
      expect.objectContaining({
        nodeOptions: expect.objectContaining({
          cwd: projectDir,
          stdio: 'pipe',
        }),
      }),
    );
    throw new Error('spawn npx ENOENT');
  });

  const error = await getCreateError(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'shared-docs',
          label: 'Shared Docs',
          source: 'acme/skills',
          skill: 'docs/shared',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--skill',
        'shared-docs',
      ],
    }),
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe('spawn npx ENOENT');
});

test('should stream task log output when skill installation is async', async () => {
  const projectDir = path.join(testDir, 'skills-async-install');
  const taskLogEvents = mocks.state.taskLogEvents;
  createExecCommand(async ({ command, args, options }) => {
    expect(command).toBe('npx');
    expect(args).toEqual([
      '-y',
      'skills',
      'add',
      'acme/skills',
      '--agent',
      'universal',
      '--yes',
      '--copy',
      '--skill',
      'docs/shared',
    ]);
    expect(options).toEqual(
      expect.objectContaining({
        nodeOptions: expect.objectContaining({
          cwd: projectDir,
          stdio: 'pipe',
        }),
      }),
    );
    return {
      result: {
        stdout: 'installing...done',
        stderr: '',
        exitCode: 0,
      },
      lines: ['installing...', 'done'],
    };
  });

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
        skill: 'docs/shared',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'shared-docs',
    ],
  });

  expect(taskLogEvents).toEqual([
    'create:Installing skill shared-docs',
    'message:Installing skill shared-docs:installing...',
    'message:Installing skill shared-docs:done',
    'success:Installing skill shared-docs:Installed skill shared-docs',
  ]);
});

test('should preserve carriage-return chunks in the task log output', async () => {
  const projectDir = path.join(testDir, 'skills-carriage-return-output');
  const taskLogEvents = mocks.state.taskLogEvents;
  createExecCommand(() => ({
    result: {
      stdout: 'Repository cloned',
      stderr: '',
      exitCode: 0,
    },
    lines: ['Cloning repository\rCloning repository...\rRepository cloned'],
  }));

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
        skill: 'docs/shared',
      },
    ],
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
      '--skill',
      'shared-docs',
    ],
  });

  expect(taskLogEvents).toEqual([
    'create:Installing skill shared-docs',
    'message:Installing skill shared-docs:Cloning repository\rCloning repository...\rRepository cloned',
    'success:Installing skill shared-docs:Installed skill shared-docs',
  ]);
});

test('should stream install output and show the command error in the task log when installation fails', async () => {
  const projectDir = path.join(testDir, 'skills-install-streaming-failure');
  createExecCommand(() => ({
    result: {
      stdout: 'cloning...\nchecking...',
      stderr: 'install failed',
      exitCode: 1,
    },
    lines: ['cloning...', 'checking...', 'install failed'],
  }));

  const error = await getCreateError(
    create({
      name: 'test',
      root: fixturesDir,
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'shared-docs',
          label: 'Shared Docs',
          source: 'acme/skills',
          skill: 'docs/shared',
        },
      ],
      argv: [
        'node',
        'test',
        '--dir',
        projectDir,
        '--template',
        'vanilla',
        '--skill',
        'shared-docs',
      ],
    }),
  );

  expect(mocks.state.taskLogEvents).toEqual([
    'create:Installing skill shared-docs',
    'message:Installing skill shared-docs:cloning...',
    'message:Installing skill shared-docs:checking...',
    'message:Installing skill shared-docs:install failed',
    'error:Installing skill shared-docs:Failed to install skill "shared-docs" from "acme/skills" using command: npx -y skills add acme/skills --agent universal --yes --copy --skill docs/shared',
  ]);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(
    'Failed to install skill "shared-docs" from "acme/skills" using command: npx -y skills add acme/skills --agent universal --yes --copy --skill docs/shared',
  );
});

test('should order skill prompt options using pre, default, and post order', async () => {
  const projectDir = path.join(testDir, 'skills-ordering-proof');
  rs.mocked(mocks.multiselect).mockImplementation(
    async <Value>({
      message,
      options,
    }: {
      message?: string;
      options?: Array<{ value: Value; label?: string; hint?: string }>;
    }) => {
      if (message?.includes('Select optional skills')) {
        mocks.state.promptOptions = (options ?? []) as Array<{
          value: string;
          label?: string;
          hint?: string;
        }>;
        return [];
      }
      return [];
    },
  );

  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    extraSkills: [
      {
        value: 'post-skill',
        label: 'Post Skill',
        source: 'acme/skills',
        order: 'post',
      },
      {
        value: 'pre-skill',
        label: 'Pre Skill',
        source: 'acme/skills',
        order: 'pre',
      },
      {
        value: 'default-skill',
        label: 'Default Skill',
        source: 'acme/skills',
      },
    ],
    argv: ['node', 'test', projectDir, '--tools', ''],
  });

  expect(mocks.state.promptOptions).toEqual([
    {
      value: 'pre-skill',
      label: 'Pre Skill',
      hint: 'acme/skills',
    },
    {
      value: 'default-skill',
      label: 'Default Skill',
      hint: 'acme/skills',
    },
    {
      value: 'post-skill',
      label: 'Post Skill',
      hint: 'acme/skills',
    },
  ]);
});
