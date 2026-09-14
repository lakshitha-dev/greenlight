import { defineConfig } from "vitest/config";


export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // the suite must never touch the network: a CISA outage or an NVD rate
    // limit is not a reason for these to go red
    globals: false,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/db.ts", "lib/sources/claude.ts"],
      reporter: ["text", "html"],
    },
  },
  resolve: { alias: { "@": import.meta.dirname } },
});
