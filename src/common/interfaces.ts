export interface IConfig {
  get: <T>(setting: string) => T;
  has: (setting: string) => boolean;
}

export interface DbConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}
