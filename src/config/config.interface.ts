export interface Config {
  github: GitHubConfig;
}

export interface GitHubConfig {
  username: string;
  token: string;
}