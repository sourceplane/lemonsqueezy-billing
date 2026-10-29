// eslint-config-next 16 ships flat configs. Upstream linted with its own
// ESLint 8 config (eslint-config-next plus typescript-eslint's strict rules);
// this is what `create-next-app` generates for Next 16, with the rules that
// flag the template's code as written turned off rather than the code
// rewritten (see IMPLEMENTATION-STATUS.md).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Upstream's catch blocks name an `error` they never read, and its
      // ESLint-disable comments name rules this config does not load.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Upstream's signup button evaluates `cond && call()` as a statement.
      "@typescript-eslint/no-unused-expressions": "off",
      // Upstream's forwardRef components carry no displayName, and the
      // dashboard's webhook text a bare apostrophe ("you'd").
      "react/display-name": "off",
      "react/no-unescaped-entities": "off",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
