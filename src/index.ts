import process from "node:process";

import config from "./config/config.js";
import { buildLibra } from "./build-libra/index.js";

async function main() {
  const tasks = buildLibra(config);
  await tasks.run();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});