import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, rs, test } from 'rstack/test';
import { copyFolder, create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'package-manager-files');
const testDir = path.join(fixturesDir, 'test-temp-output');
const extraToolDir = path.join(fixturesDir, 'template-storybook');

beforeEach(() => {
  rs.unstubAllEnvs();

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

async function createProject(projectDir: string) {
  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    git: false,
    builtinTools: [],
    argv: ['node', 'test', '--dir', projectDir, '--template', 'vanilla'],
  });
}

async function createProjectWithExtraTool(projectDir: string) {
  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    git: false,
    builtinTools: [],
    extraTools: [
      {
        value: 'storybook',
        label: 'Storybook',
        action: ({ distFolder, skipFiles }) => {
          copyFolder({
            from: extraToolDir,
            to: distFolder,
            skipFiles,
            isMergePackageJson: true,
          });
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
      'storybook',
    ],
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

test('should copy pnpm-workspace.yaml from an extra tool for pnpm', async () => {
  const projectDir = path.join(testDir, 'extra-tool-pnpm');
  rs.stubEnv('npm_config_user_agent', 'pnpm/11.20.0');

  await createProjectWithExtraTool(projectDir);

  expect(
    fs.readFileSync(path.join(projectDir, 'pnpm-workspace.yaml'), 'utf8'),
  ).toBe('allowBuilds:\n  esbuild: true\n');
});

test('should skip pnpm-workspace.yaml from an extra tool for npm', async () => {
  const projectDir = path.join(testDir, 'extra-tool-npm');
  rs.stubEnv('npm_config_user_agent', 'npm/11.0.0');

  await createProjectWithExtraTool(projectDir);

  expect(fs.existsSync(path.join(projectDir, 'pnpm-workspace.yaml'))).toBe(
    false,
  );
});
