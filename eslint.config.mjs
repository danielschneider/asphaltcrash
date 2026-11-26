// ESLint 10 needs the 'jiti' package to load eslint.config.ts; jiti is not an approved dependency, so this config is plain ESM.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import sonarjs from "eslint-plugin-sonarjs";
import { defineConfig, globalIgnores } from "eslint/config";

const RESTRICTIONS = {
  react: {
    group: ["react", "react/*"],
    message: "L2/L3/L1/L4: React is forbidden here (AGENTS section 3).",
  },
  reactDom: {
    group: ["react-dom", "react-dom/*"],
    message: "L2/L3/L1/L4: React DOM is forbidden here (AGENTS section 3).",
  },
  pixi: {
    group: ["pixi.js", "pixi.js/*"],
    message:
      "pixi.js only in Renderer.ts, Effects.ts, Camera.ts, src/game/render/** (ARCHITECTURE section 4).",
  },
  matter: {
    group: ["matter-js", "matter-js/*"],
    message:
      "matter-js only in Physics.ts and src/game/physics/** (AGENTS section 3).",
  },
  peerjs: {
    group: ["peerjs", "peerjs/*"],
    message: "peerjs only in src/network/** (AGENTS section 3).",
  },
  network: {
    group: ["**/network/**"],
    message:
      "src/network/** must not be imported from this layer (AGENTS section 3).",
  },
  components: {
    group: ["**/components/**"],
    message:
      "src/components/** must not be imported from this layer (AGENTS section 3).",
  },
  simCore: {
    group: ["**/game/sim/**", "**/game/Engine", "**/game/Engine.ts"],
    message:
      "UI must not import the simulation or Engine directly; use the L4 session (AGENTS section 3).",
  },
};

const RESTRICTED_PROPERTIES = {
  mathRandom: {
    object: "Math",
    property: "random",
    message: "Use the seeded RNG (sim/Rng.ts); Math.random breaks determinism.",
  },
  dateNow: {
    object: "Date",
    property: "now",
    message: "Use fixed-step sim time; wall-clock reads are forbidden here.",
  },
  performanceNow: {
    object: "performance",
    property: "now",
    message: "Use fixed-step sim time; wall-clock reads are forbidden here.",
  },
  processEnv: {
    object: "process",
    property: "env",
    message: "Read environment values via import.meta.env in src/config only.",
  },
};

const REACT_FC_MESSAGE =
  "Avoid React.FC. Declare a Props interface and a plain function.";

const LAYER_IMPORT_KEYS = {
  L2: [
    "react",
    "reactDom",
    "pixi",
    "matter",
    "peerjs",
    "network",
    "components",
  ],
  physics: ["react", "reactDom", "pixi", "peerjs", "network", "components"],
  render: ["react", "reactDom", "matter", "peerjs", "network", "components"],
  runtime: ["react", "reactDom", "pixi", "matter", "peerjs", "components"],
  session: ["pixi", "matter", "peerjs"],
  network: ["react", "reactDom", "pixi", "matter", "components"],
  ui: ["matter", "peerjs", "simCore"],
};

const COMPLEXITY_STRICT_FILES = [
  "src/game/sim/**/*.ts",
  "src/game/Physics.ts",
  "src/game/physics/**/*.ts",
  "src/game/Rules.ts",
];

const LAYER_FILES = {
  L2: [
    "src/game/sim/**/*.ts",
    "src/game/Rules.ts",
    "src/game/WorldView.ts",
    "src/game/bots/**/*.ts",
    "src/types/**/*.ts",
    "src/config/**/*.ts",
  ],
  physics: ["src/game/Physics.ts", "src/game/physics/**/*.ts"],
  render: [
    "src/game/Renderer.ts",
    "src/game/Effects.ts",
    "src/game/Camera.ts",
    "src/game/render/**/*.ts",
  ],
  runtime: [
    "src/game/Engine.ts",
    "src/game/input/**/*.ts",
    "src/game/shadow/**/*.ts",
  ],
  session: ["src/session/**/*.ts"],
  network: ["src/network/**/*.ts"],
  ui: [
    "src/components/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
    "src/App.tsx",
    "src/main.tsx",
  ],
};

const LAYER_IMPORT_RULES = Object.entries(LAYER_FILES).map(
  ([layer, files]) => ({
    files,
    rules: {
      "no-restricted-imports": restrictImports(LAYER_IMPORT_KEYS[layer]),
    },
  }),
);

function restrictImports(keys) {
  return ["error", { patterns: keys.map((key) => RESTRICTIONS[key]) }];
}

function restrictProperties(keys) {
  return ["error", ...keys.map((key) => RESTRICTED_PROPERTIES[key])];
}

export default defineConfig(
  globalIgnores(["dist/**", "node_modules/**", "coverage/**"]),
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  sonarjs.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [
        createNodeResolver({ extensions: [".ts", ".tsx", ".js", ".mjs"] }),
      ],
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "import-x/no-cycle": "error",
      "import-x/no-unresolved": "off",
      "import-x/no-duplicates": "error",
      "sonarjs/cognitive-complexity": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictImports(["pixi", "matter", "peerjs"]),
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message:
            "No enum. Use an as const object with a derived union type (AGENTS 4.1).",
        },
        {
          selector: "MemberExpression[object.name='React'][property.name='FC']",
          message: REACT_FC_MESSAGE,
        },
        {
          selector: "TSQualifiedName[left.name='React'][right.name='FC']",
          message: REACT_FC_MESSAGE,
        },
        {
          selector: "TSTypeReference[typeName.name='FC']",
          message: REACT_FC_MESSAGE,
        },
      ],
    },
  },
  ...LAYER_IMPORT_RULES,
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "max-lines": [
        "error",
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      "no-restricted-imports": restrictImports(["matter", "peerjs", "simCore"]),
    },
  },
  {
    files: COMPLEXITY_STRICT_FILES,
    rules: {
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },
  // Flat config: the last matching block replaces a rule's options, so each file group lists its full set.
  {
    files: ["src/game/**/*.ts", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": restrictProperties(["processEnv"]),
    },
  },
  {
    files: ["src/config/**/*.ts"],
    rules: {
      "no-restricted-properties": restrictProperties([
        "mathRandom",
        "dateNow",
        "performanceNow",
      ]),
    },
  },
  {
    files: ["src/game/sim/**/*.ts", "src/game/bots/**/*.ts"],
    rules: {
      "no-restricted-properties": restrictProperties([
        "mathRandom",
        "dateNow",
        "performanceNow",
        "processEnv",
      ]),
    },
  },
  {
    files: [
      "src/game/Physics.ts",
      "src/game/physics/**/*.ts",
      "src/game/Rules.ts",
    ],
    rules: {
      "no-restricted-properties": restrictProperties([
        "dateNow",
        "performanceNow",
        "processEnv",
      ]),
    },
  },
);
