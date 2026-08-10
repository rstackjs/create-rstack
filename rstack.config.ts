import { define } from 'rstack';

define.lib({
  lib: [
    {
      dts: {
        bundle: true,
      },
      shims: {
        esm: {
          require: true,
        },
      },
    },
  ],
});

define.lint(async () => {
  const { js, ts } = await import('rstack/lint');

  return [js.configs.recommended, ts.configs.recommended];
});

define.fmt({
  singleQuote: true,
});

define.staged({
  '*.{js,jsx,ts,tsx,mjs,cjs}': ['rs lint', 'rs fmt'],
});
