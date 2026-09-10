import { test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("Ctrl + . ouvre Pi2 ou bascule les annotations sans perdre le brouillon", async () => {
  try {
    await promisify(execFile)("xvfb-run", ["-a", "bun", "scripts/test-shortcut.ts"], {
      env: { ...process.env, PI2_ORIGINAL_DISPLAY: process.env.DISPLAY ?? "" },
      timeout: 75000,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw Error(`${failure.message}\n${failure.stdout ?? ""}`);
  }
});
