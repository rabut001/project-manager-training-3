import { defineConfig, devices } from "@playwright/test";

const base = process.env.BASE_PATH || "/";
export default defineConfig({
  testDir: "./tests/production",
  use: { baseURL: `http://127.0.0.1:4173${base}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run preview",
    url: `http://127.0.0.1:4173${base}`,
    reuseExistingServer: false,
  },
});
