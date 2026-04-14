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
          when: (templateName) => templateName === 'vanilla',
        },
        {
          value: 'react-docs',
          label: 'React Docs',
          source: 'acme/skills',
          when: (templateName) => templateName === 'react',
        },
        {
          value: 'rstest-best-practices',
          label: 'Rstest Best Practices',
          source: 'rstackjs/agent-skills',
          when: (_templateName, selectedTools) => selectedTools.includes('rstest'),
        },
      ],
      argv: ['node', 'test', '--help', '--template', 'vanilla', '--tools', 'biome'],
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
