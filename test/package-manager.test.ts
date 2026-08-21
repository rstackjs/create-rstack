import { expect, test } from 'rstack/test';
import {
  getAgentCreateCommand,
  replaceCreateCommand,
} from '../src/package-manager';

test.each([
  ['npm', 'npx -y create-test@latest'],
  ['pnpm', 'pnpm create test@latest'],
  ['yarn', 'yarn create test'],
  ['bun', 'bun create test@latest'],
  ['deno', 'deno run -A npm:create-test@latest'],
  ['unknown', 'npx -y create-test@latest'],
])('should get the agent create command for %s', (packageManager, expected) => {
  expect(getAgentCreateCommand('test', packageManager)).toBe(expected);
});

test.each([
  ['npm', 'npm create test@latest -y -- --template vanilla'],
  ['pnpm', 'pnpm create test@latest --template vanilla'],
  ['yarn', 'yarn create test --template vanilla'],
  ['bun', 'bun create test@latest --template vanilla'],
  ['deno', 'deno run -A npm:create-test@latest --template vanilla'],
  ['unknown', 'npm create test@latest -- --template vanilla'],
])('should replace the create command for %s', (packageManager, expected) => {
  expect(
    replaceCreateCommand(
      'npm create test@latest -- --template vanilla',
      packageManager,
    ),
  ).toBe(expected);
});

test.each([
  'npm create test@latest -y -- --template vanilla',
  'npm create test@latest --yes -- --template vanilla',
  'npm create test@latest --yes=false -- --template vanilla',
])('should preserve an existing npm yes flag in %s', (command) => {
  expect(replaceCreateCommand(command, 'npm')).toBe(command);
});

test('should distinguish an npm flag from a scaffolder argument', () => {
  expect(replaceCreateCommand('npm create test@latest -- --yes', 'npm')).toBe(
    'npm create test@latest -y -- --yes',
  );
});
