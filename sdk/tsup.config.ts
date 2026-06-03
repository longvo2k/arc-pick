import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "server/index": "src/server/index.ts",
    "agent/index": "src/agent/index.ts",
    "adapters/index": "src/adapters/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  target: "es2022",
});
