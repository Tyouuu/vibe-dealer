import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not application code, and `npm run lint` failed on a clean checkout
    // because of them — five no-require-imports errors from plain Node
    // scripts that are supposed to use require(), plus warnings from a skill's
    // own tooling. Linting src/ was already clean; this makes the command
    // agree with that.
    "scripts/**",
    "qa-*.js",
    ".claude/**",
    "design-audit.mjs",
  ]),
]);

export default eslintConfig;
