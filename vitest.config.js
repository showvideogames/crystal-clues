import { defineConfig } from "vitest/config";

// Unit tests for the account modules (src/account/*.test.js) run in jsdom so
// localStorage and window exist. They never touch a network: Supabase and
// fetch are stubbed per test. The database tests live under tests/db and
// run with node:test against the local stack (npm run test:db).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.js"],
    env: {
      // A loopback placeholder so the client can be constructed; tests that
      // need "not configured" stub the env themselves and re-import.
      VITE_SUPABASE_URL: "http://127.0.0.1:1",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      VITE_PLATFORM_DISCOVERY_URL: "http://127.0.0.1:1/.well-known/openid-configuration",
    },
  },
});
