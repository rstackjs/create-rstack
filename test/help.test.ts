import { expect, test } from '@rstest/core';
import { logger } from 'rslog';
import { create } from '../src';

test('help message includes the Git opt-out option', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  expect(logs.join('\n')).toContain(
    '--no-git              skip Git repository initialization',
  );
});

test('help message hides the Git opt-out option when Git is disabled', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      git: false,
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  expect(logs.join('\n')).not.toContain('--no-git');
});

test('help message includes extra tools', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraTools: [{ value: 'custom-tool', label: 'Custom Tool' }],
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).toContain('eslint, rslint, biome, prettier, custom-tool');
});

test('help message excludes disabled built-in tools', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      builtinTools: [],
      extraTools: [{ value: 'custom-tool', label: 'Custom Tool' }],
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).toContain('--tools <tool>');
  expect(logOutput).toContain('Optional tools:');
  expect(logOutput).toContain('custom-tool');
  expect(logOutput).not.toContain('eslint');
  expect(logOutput).not.toContain('rslint');
  expect(logOutput).not.toContain('biome');
  expect(logOutput).not.toContain('prettier');
});

test('help message hides tools when all tools are disabled', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      builtinTools: [],
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).not.toContain('--tools <tool>');
  expect(logOutput).not.toContain('Optional tools:');
});

test('help message hides skill help when no optional skills are configured', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).not.toContain('--skill <skill>');
  expect(logOutput).not.toContain('Optional skills:');
});

test('help message includes optional skills', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'git-url',
          label: 'Git URL',
          source: 'vercel-labs/agent-skills',
        },
      ],
      argv: ['node', 'test', '--help'],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).toContain('--skill <skill>');
  expect(logOutput).toContain('Optional skills:');
  expect(logOutput).toContain('git-url');
});

test('help message lists all optional skills even when template and tools are provided', async () => {
  const logs: string[] = [];
  const originalLog = logger.log;

  logger.override({
    log: (message?: unknown) => {
      logs.push(String(message ?? ''));
    },
  });

  try {
    await create({
      name: 'test',
      root: '.',
      templates: ['vanilla', 'react'],
      getTemplateName: async () => 'vanilla',
      extraSkills: [
        {
          value: 'shared-docs',
          label: 'Shared Docs',
          source: 'acme/skills',
          when: ({ templateName }) => templateName === 'vanilla',
        },
        {
          value: 'react-docs',
          label: 'React Docs',
          source: 'acme/skills',
          when: ({ templateName }) => templateName === 'react',
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
        '--help',
        '--template',
        'vanilla',
        '--tools',
        'biome',
      ],
    });
  } finally {
    logger.override({
      log: originalLog,
    });
  }

  const logOutput = logs.join('\n');
  expect(logOutput).toContain('--skill <skill>');
  expect(logOutput).toContain('Optional skills:');
  expect(logOutput).toContain('shared-docs');
  expect(logOutput).toContain('react-docs');
  expect(logOutput).toContain('rstest-best-practices');
});
