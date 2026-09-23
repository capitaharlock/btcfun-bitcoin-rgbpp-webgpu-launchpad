// Types for `local.mjs`, so the TypeScript browser suite reads the same wallet file.
export declare const LOCAL_DIR: string;
export declare const WALLET_FILE: string;
export declare function runFile(name: string): string;
export declare function storedMnemonic(): string | null;
export declare function requireMnemonic(): string;
