import { expect, test } from '@rstest/core';
import { logger } from 'rslog';
import { create } from '../src';

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
  expect(logOutput).toContain('biome, eslint, prettier, custom-tool');
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
