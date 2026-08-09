import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, rs, test } from '@rstest/core';
import { create } from '../src';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'basic');
const testDir = path.join(fixturesDir, 'test-temp-output-git');

const mocks = rs.hoisted(() => ({
  x: rs.fn(),
  xSync: rs.fn(),
}));

rs.mock('tinyexec', () => ({
  x: mocks.x,
  xSync: mocks.xSync,
}));

const createResult = (exitCode: number, stderr = '') => ({
  stdout: '',
  stderr,
  exitCode,
});

beforeEach(() => {
  rs.mocked(mocks.xSync).mockReset();
  rs.mocked(mocks.xSync).mockImplementation((_command, args) =>
    createResult(args[0] === 'rev-parse' ? 128 : 0),
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

async function createProject(projectDir: string, git?: boolean) {
  await create({
    name: 'test',
    root: fixturesDir,
    templates: ['vanilla'],
    getTemplateName: async () => 'vanilla',
    git,
    argv: ['node', 'test', '--dir', projectDir, '--template', 'vanilla'],
  });
}

test('should initialize a Git repository by default', async () => {
  const projectDir = path.join(testDir, 'default');

  await createProject(projectDir);

  expect(mocks.xSync).toHaveBeenNthCalledWith(
    1,
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    { nodeOptions: { cwd: projectDir } },
  );
  expect(mocks.xSync).toHaveBeenNthCalledWith(2, 'git', ['init'], {
    nodeOptions: { cwd: projectDir },
  });
});

test('should reuse an existing Git repository', async () => {
  const projectDir = path.join(testDir, 'existing');
  rs.mocked(mocks.xSync).mockReturnValue(createResult(0));

  await createProject(projectDir);

  expect(mocks.xSync).toHaveBeenCalledTimes(1);
  expect(mocks.xSync).toHaveBeenCalledWith(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    { nodeOptions: { cwd: projectDir } },
  );
});

test('should skip Git initialization when disabled', async () => {
  const projectDir = path.join(testDir, 'disabled');

  await createProject(projectDir, false);

  expect(mocks.xSync).not.toHaveBeenCalled();
});

test('should continue when Git initialization fails', async () => {
  const projectDir = path.join(testDir, 'failure');
  rs.mocked(mocks.xSync).mockImplementation((_command, args) =>
    args[0] === 'rev-parse'
      ? createResult(128)
      : createResult(1, 'Git is unavailable'),
  );

  await expect(createProject(projectDir)).resolves.toBeUndefined();
  expect(mocks.xSync).toHaveBeenCalledTimes(2);
});
