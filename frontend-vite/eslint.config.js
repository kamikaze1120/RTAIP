import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact_recommended from "eslint-plugin-react/configs/recommended.js";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: ["dist/*", "tailwind.config.js", "postcss.config.js"],
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,mjsx,ts,tsx,mtsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": "warn",
    },
  },
  ...tseslint.configs.recommended,
  {
    ...pluginReact_recommended,
    rules: {
      ...pluginReact_recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];