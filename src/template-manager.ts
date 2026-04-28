import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const NPM_TEMPLATE_PREFIX = 'npm:';

// Validates that a string looks like a valid npm package name/version
// to prevent unexpected values from being passed to npm install
const VALID_NPM_NAME = /^(@[\w.-]+\/)?[\w.-]+$/;
const VALID_NPM_VERSION = /^[\w.\-+^~>=<* ]+$/;

/**
 * Sanitize package name and version to create a valid cache key
 */
export const sanitizeCacheKey = (packageName: string, version: string) => {
  // Keep the slash for scoped packages (e.g., @scope/package)
  // but replace other slashes that would be invalid in file paths
  const normalized = packageName.startsWith('@')
    ? packageName
    : packageName.replace(/[\\/]/g, '_');
  const versionLabel = version || 'latest';
  return `${normalized}@${versionLabel}`;
};

/**
 * Check if the input is an npm package template
 */
export function isNpmTemplate(templateInput: string): boolean {
  const trimmedInput = templateInput.trim();

  // Explicit npm: prefix
  if (trimmedInput.startsWith(NPM_TEMPLATE_PREFIX)) {
    return true;
  }

  // Scoped package (@scope/package) or pure package name (no path separators)
  if (
    trimmedInput.startsWith('@') ||
    (!trimmedInput.includes('/') &&
      !trimmedInput.startsWith('http') &&
      !trimmedInput.startsWith('.') &&
      !trimmedInput.startsWith('github:'))
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve npm template package and return the local path
 */
export function resolveNpmTemplate(
  packageName: string,
  version?: string,
  options?: { forceLatest?: boolean; cacheDir?: string },
): string {
  const normalizedName = packageName.trim();

  // Handle version
  const versionSpecifier =
    version?.trim() && version.trim().toLowerCase() !== 'latest'
      ? version.trim()
      : 'latest';

  // Validate inputs to prevent unexpected values from reaching npm
  if (!VALID_NPM_NAME.test(normalizedName)) {
    throw new Error(
      `Invalid npm package name: "${normalizedName}". Package names may only contain word characters, hyphens, and dots.`,
    );
  }
  if (
    versionSpecifier !== 'latest' &&
    !VALID_NPM_VERSION.test(versionSpecifier)
  ) {
    throw new Error(
      `Invalid version specifier: "${versionSpecifier}". Version may only contain word characters, dots, hyphens, and range operators.`,
    );
  }

  // Generate cache key
  const cacheKey = sanitizeCacheKey(normalizedName, versionSpecifier);
  const cacheRoot = options?.cacheDir || process.cwd();
  const templateDir = path.join(cacheRoot, '.temp-templates', cacheKey);
  // Isolate each install per cache key to avoid concurrent install races
  const installRoot = path.join(templateDir, '.install');
  const packagePath = path.join(installRoot, 'node_modules', normalizedName);

  // Check if we should reuse cache
  const forceLatest = options?.forceLatest ?? versionSpecifier === 'latest';
  const shouldReuseCache = !forceLatest && fs.existsSync(templateDir);

  if (shouldReuseCache) {
    return templateDir;
  }

  // Create isolated package.json to prevent workspace conflicts
  fs.mkdirSync(installRoot, { recursive: true });
  const anchorPkgJson = path.join(installRoot, 'package.json');
  if (!fs.existsSync(anchorPkgJson)) {
    const minimal = { name: 'create-rstack-template-cache', private: true };
    fs.writeFileSync(
      anchorPkgJson,
      `${JSON.stringify(minimal, null, 2)}\n`,
      'utf8',
    );
  }

  // Install the package using execFileSync to avoid shell injection
  try {
    execFileSync(
      'npm',
      [
        'install',
        `${normalizedName}@${versionSpecifier}`,
        '--no-save',
        '--package-lock=false',
        '--no-audit',
        '--no-fund',
        '--silent',
      ],
      {
        cwd: installRoot,
        stdio: 'pipe',
      },
    );
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err
        ? String((err as { stderr: unknown }).stderr).trim()
        : '';
    const detail = stderr
      ? `\n${stderr.split('\n').slice(0, 5).join('\n')}`
      : '';
    throw new Error(
      `Failed to install npm template "${normalizedName}@${versionSpecifier}". Please check if the package exists.${detail}`,
    );
  }

  // Find template directory (by priority)
  const possibleTemplatePaths = [
    path.join(packagePath, 'template'), // Priority: package/template
    path.join(packagePath, 'templates', 'app'),
    path.join(packagePath, 'templates', 'default'),
    packagePath, // Fallback: package root
  ];

  for (const pathCandidate of possibleTemplatePaths) {
    if (
      fs.existsSync(pathCandidate) &&
      fs.statSync(pathCandidate).isDirectory()
    ) {
      // Clear stale cache before copying to avoid leftover files from older versions
      if (fs.existsSync(templateDir)) {
        for (const entry of fs.readdirSync(templateDir)) {
          if (entry === '.install') continue;
          fs.rmSync(path.join(templateDir, entry), {
            recursive: true,
            force: true,
          });
        }
      }
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      fs.cpSync(pathCandidate, templateDir, { recursive: true });
      return templateDir;
    }
  }

  throw new Error(
    `No valid template directory found in package "${normalizedName}". Expected one of: template/, templates/app/, templates/default/, or package root.`,
  );
}

/**
 * Resolve custom template (npm package, GitHub, or local path)
 */
export function resolveCustomTemplate(
  templateInput: string,
  version?: string,
  options?: { forceLatest?: boolean; cacheDir?: string },
): string {
  const trimmedInput = templateInput.trim();

  // Handle npm: prefix explicitly
  if (trimmedInput.startsWith(NPM_TEMPLATE_PREFIX)) {
    const packageName = trimmedInput.slice(NPM_TEMPLATE_PREFIX.length).trim();
    return resolveNpmTemplate(packageName, version, options);
  }

  // Handle scoped package or pure package name
  if (isNpmTemplate(trimmedInput)) {
    return resolveNpmTemplate(trimmedInput, version, options);
  }

  // For GitHub URLs or local paths, return as-is (handled by create-rstack)
  return trimmedInput;
}
