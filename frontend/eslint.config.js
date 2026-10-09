import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // .vite holds Vite's pre-bundled copies of libraries; linting it reports
  // hundreds of problems in code that isn't ours.
  globalIgnores(["dist", ".vite"]),

  {
    files: ["**/*.{js,jsx}"],
    extends: [
      js.configs.recommended,
      // `flat.recommended`, not `recommended`: in eslint-plugin-react-hooks v7
      // the top-level `recommended` is still the legacy eslintrc format and
      // would load no rules at all under flat config.
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    rules: {
      // Core no-unused-vars cannot see JSX, so without this every component
      // rendered as <Foo /> is reported as an unused import. The Vite template
      // works around that by ignoring all capitalised names instead — which
      // also hides a component import that genuinely isn't rendered any more,
      // the exact mistake a refactor makes.
      "react/jsx-uses-vars": "error",
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Build tooling runs in Node, not the browser.
  {
    files: ["vite.config.js", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
]);
