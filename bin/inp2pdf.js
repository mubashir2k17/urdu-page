#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cliSrc = resolve(here, "../packages/cli/src/cli.ts");

const args = process.argv.slice(2);
const result = spawnSync("npx", ["--yes", "tsx", cliSrc, ...args], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
