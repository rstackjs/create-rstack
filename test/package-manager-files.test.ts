import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, rs, test } from '@rstest/core';
import { create } from '../src';
import * as templateManagerActual from '../src/template-manager.js' with {
  rstest: 'importActual',
};

const mocks = rs.hoisted(() => ({
  resolveCustomTemplate: rs.fn(),
}));

rs.mock('../src/template-manager.js', () => ({
  ...templateManagerActual,
  resolveCustomTemplate: mocks.resolveCustomTemplate,
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'package-manager-files');
const testDir = path.join(fixturesDir, 'test-temp-output');

beforeEach(() => {
  rs.unstubAllEnvs();
  rs.mocked(mocks.resolveCustomTemplate).mockReset();

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  return () => {
    rs.unstubAllEnvs();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  };
});

async function createProject(projectDir: string, template = 'vanilla') {
  await create({
    name: 'test',
    root: fixturesDir,
    templates: [template],
    getTemplateName: async () => template,
    git: false,
    builtinTools: [],
    argv: ['node', 'test', '--dir', projectDir, '--template', template],
  });
}

test('should copy pnpm-workspace.yaml for pnpm', async () => {
  const projectDir = path.join(testDir, 'pnpm');
  rs.stubEnv('npm_config_user_agent', 'pnpm/11.20.0');

  await createProject(projectDir);

  expect(fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))).toBe(
    true,
  );
});

test('should skip pnpm-workspace.yaml for other package managers', async () => {
  const projectDir = path.join(testDir, 'npm');
  rs.stubEnv('npm_config_user_agent', 'npm/11.0.0');

  await createProject(projectDir);

  expect(fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))).toBe(
    false,
  );
});

test('should preserve pnpm-workspace.yaml in third-party templates', async () => {
  const projectDir = path.join(testDir, 'third-party');
  const templateDir = path.join(fixturesDir, 'third-party-template');
  rs.stubEnv('npm_config_user_agent', 'npm/11.0.0');
  rs.mocked(mocks.resolveCustomTemplate).mockReturnValue(templateDir);

  await createProject(projectDir, 'third-party-template');

  expect(mocks.resolveCustomTemplate).toHaveBeenCalled();
  expect(fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))).toBe(
    true,
  );
});
