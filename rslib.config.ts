import { defineConfig } from '@rslib/core';

export default defineConfig({
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
