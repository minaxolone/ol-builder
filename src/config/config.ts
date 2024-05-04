import process from "node:process";

import { Config } from "./config.interface.js";

const ENV = process.env;

const config: Config = {
  github: {
    username: ENV.GITHUB_USERNAME!,
    token: ENV.GITHUB_TOKEN!,
  },
};

export default config;
