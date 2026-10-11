import { defineConfig, devices } from "@playwright/test";

const PORTA = 3100;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    // Ambiente sem download de navegador: aponte para um Chromium local.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // No CI o build já foi feito no passo anterior.
    command: process.env.CI ? `pnpm start -p ${PORTA}` : `pnpm dev -p ${PORTA}`,
    url: `http://127.0.0.1:${PORTA}/entrar`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
