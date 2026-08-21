const CREATE_COMMAND_REPLACEMENTS: Record<string, string> = {
  bun: 'bun create ',
  nub: 'nub create ',
  pnpm: 'pnpm create ',
  yarn: 'yarn create ',
  deno: 'deno run -A npm:create-',
};

function addNpmYesFlag(command: string) {
  const separatorIndex = command.indexOf(' -- ');
  const npmCommand =
    separatorIndex === -1 ? command : command.slice(0, separatorIndex);

  if (/(?:^|\s)(?:-y|--yes(?:=\S+)?)(?=\s|$)/.test(npmCommand)) {
    return command;
  }

  return separatorIndex === -1
    ? `${command} -y`
    : `${npmCommand} -y${command.slice(separatorIndex)}`;
}

export function replaceCreateCommand(command: string, packageManager: string) {
  if (!command.startsWith('npm create ')) {
    return command;
  }

  if (packageManager === 'npm') {
    return addNpmYesFlag(command);
  }

  const replacement = CREATE_COMMAND_REPLACEMENTS[packageManager];
  if (!replacement) {
    return command;
  }

  const replacedCommand = command
    .replace('npm create ', replacement)
    // Other package managers don't need the extra `--`.
    .replace(' -- --', ' --');

  // Yarn v1 does not support the `@latest` tag.
  return packageManager === 'yarn'
    ? replacedCommand.replace('@latest', '')
    : replacedCommand;
}

export function getAgentCreateCommand(name: string, packageManager: string) {
  if (packageManager === 'npm') {
    return `npx -y create-${name}@latest`;
  }

  const npmCreateCommand = `npm create ${name}@latest`;
  const createCommand = replaceCreateCommand(npmCreateCommand, packageManager);

  return createCommand === npmCreateCommand
    ? `npx -y create-${name}@latest`
    : createCommand;
}
