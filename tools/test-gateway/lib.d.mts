export interface StackOptions {
  adminUrl: string;
  postgrestBin: string;
  migrationsDir: string;
  shimSql: string;
  jwtSecret?: string;
  dbName?: string;
  auth?: boolean;
  requireConfirm?: boolean;
  gatewayPort?: number;
}
export interface Stack {
  url: string;
  anonKey: string;
  jwtSecret: string;
  dbUrl: string;
  dbName: string;
  createUser(email: string): Promise<{ id: string; email: string; jwt: string }>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  stop(): Promise<void>;
}
export function signJwt(payload: Record<string, unknown>, secret: string): string;
export function verifyJwt(token: string, secret: string): Record<string, unknown> | null;
export function startStack(options: StackOptions): Promise<Stack>;
