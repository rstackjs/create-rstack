import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as promptsActual from '@clack/prompts' with { rstest: 'importActual' };
import { beforeEach, expect, rs, test } from '@rstest/core';
import { color } from 'rslog';
import { create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'basic');
const testDir = path.join(fixturesDir, 'test-temp-output-skills');

const mocks = rs.hoisted(() => {
  type ExecCall = {
    command: string;
    args: string[];
    options: unknown;
  };

  const state = {
    xCalls: [] as ExecCall[],
    spinnerEvents: [] as string[],
    commandLogs: [] as string[],
    promptOptions: [] as Array<{ value: string; label?: string; hint?: string }>,
  };

  const x = rs.fn(async (command: string, args: string[], options: unknown) => {
    state.xCalls.push({ command, args, options });
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }) as any;

  const xSync = rs.fn((command: string, args: string[], options: unknown) => {
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }) as any;

  const spinner = (() => ({
    start: (message?: string) => {
      state.spinnerEvents.push(`start:${message ?? ''}`);
    },
    stop: (message?: string) => {
      state.spinnerEvents.push(`stop:${message ?? ''}`);
    },
    cancel: (message?: string) => {
      state.spinnerEvents.push(`cancel:${message ?? ''}`);
    },
    error: (message?: string) => {
      state.spinnerEvents.push(`error:${message ?? ''}`);
    },
    message: () => {},
    clear: () => {},
    isCancelled: false,
  })) as typeof promptsActual.spinner;

  const multiselect = rs.fn(async (options: {
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
  }) as typeof promptsActual.multiselect;

  return {
    state,
    x,
    xSync,
    spinner,
    multiselect,
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
  log: {
    ...promptsActual.log,
    info: (message: string) => {
      mocks.state.commandLogs.push(message);
    },
  },
}));

beforeEach(() => {
  mocks.state.xCalls.length = 0;
  mocks.state.spinnerEvents.length = 0;
  mocks.state.commandLogs.length = 0;
  mocks.state.promptOptions.length = 0;
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
  }) => Promise<{ stdout: string; stderr: string; exitCode: number }> | { stdout: string; stderr: string; exitCode: number },
) {
  rs.mocked(mocks.x).mockImplementation(
    async (command: string, args: string[], options: unknown) => {
      mocks.state.xCalls.push({ command, args, options });
      if (handler) {
        return await handler({ command, args, options });
      }
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
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

test('should install selected extra skills from comma separated --skill option', async () => {
  const projectDir = path.join(testDir, 'skills-comma-separated');
  const calls = createExecCommand();
  const spinnerEvents = mocks.state.spinnerEvents;
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
  expect(spinnerEvents).toEqual([
    'start:Installing skill git-url',
    'stop:Installed skill git-url',
    'start:Installing skill docs-writer',
    'stop:Installed skill docs-writer',
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
    argv: [
      'node',
      'test',
      '--dir',
      projectDir,
      '--template',
      'vanilla',
    ],
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
    argv: [
      'node',
      'test',
      projectDir,
      '--tools',
      '',
      '--skill',
      'git-url',
    ],
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

test('should filter extra skills by template and install using skill override', async () => {
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
        when: (templateName) => templateName === 'react',
      },
      {
        value: 'shared-docs',
        label: 'Shared Docs',
        source: 'acme/skills',
        skill: 'docs/shared',
        when: (templateName) => templateName === 'vanilla',
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

test('should throw with skill context when installation fails', async () => {
  const projectDir = path.join(testDir, 'skills-install-failure');
  createExecCommand(() => {
    throw new Error('install failed');
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
    'Failed to install skill "shared-docs" from "acme/skills" using command: npx -y skills add acme/skills --agent universal --yes --copy --skill docs/shared\ninstall failed',
  );
});

test('should trim noisy skills cli output in install errors', async () => {
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
  createExecCommand(() => {
    const error = new Error('Process exited with non-zero status (1)') as Error & {
      output?: { stderr: string; stdout: string };
    };
    error.output = {
      stderr: '',
      stdout: rawStdout,
    };
    throw error;
  });

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
  expect(message).toContain(rawStdout);
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

  await expect(
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
  ).rejects.toThrow('spawn npx ENOENT');
});

test('should install skills with async spawn so spinner can render during installation', async () => {
  const projectDir = path.join(testDir, 'skills-async-install');
  const execEvents: string[] = [];
  const spinnerEvents = mocks.state.spinnerEvents;
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
    execEvents.push('started');
    await Promise.resolve();
    execEvents.push('resolved');
    return {
      stdout: 'installing...',
      stderr: '',
      exitCode: 0,
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

  expect(spinnerEvents).toEqual([
    'start:Installing skill shared-docs',
    'stop:Installed skill shared-docs',
  ]);
  expect(execEvents).toEqual(['started', 'resolved']);
});

test('should order skill prompt options using pre, default, and post order', async () => {
  const projectDir = path.join(testDir, 'skills-ordering-proof');
  rs.mocked(mocks.multiselect).mockImplementation(async <Value,>({
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
  });

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
