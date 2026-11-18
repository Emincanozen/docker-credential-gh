import { execFile } from "node:child_process";

/** Result of running an external command. */
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  /** True if the executable could not be found / started. */
  notFound?: boolean;
}

/** Injectable command runner, so tests never call the real `gh`. */
export type Executor = (cmd: string, args: string[]) => Promise<ExecResult>;

export const defaultExecutor: Executor = (cmd, args) =>
  new Promise((resolve) => {
    execFile(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") {
          resolve({ code: 127, stdout: "", stderr: "", notFound: true });
          return;
        }
        resolve({ code: typeof e.code === "number" ? e.code : 1, stdout: stdout ?? "", stderr: stderr ?? "" });
        return;
      }
      resolve({ code: 0, stdout, stderr });
    });
  });

export class GhError extends Error {
  constructor(public kind: "missing" | "not-logged-in" | "failed", message: string) {
    super(message);
  }
}

export interface GhCredentials {
  username: string;
  secret: string;
}

/**
 * Reads the active token and login from the GitHub CLI session.
 * Error messages never include command output, to avoid leaking secrets.
 */
export async function fetchGhCredentials(exec: Executor, ghHost: string, ghBin = "gh"): Promise<GhCredentials> {
  const tok = await exec(ghBin, ["auth", "token", "--hostname", ghHost]);
  if (tok.notFound) throw new GhError("missing", "the GitHub CLI (gh) was not found in PATH");
  const secret = tok.stdout.trim();
  if (tok.code !== 0 || !secret) {
    throw new GhError("not-logged-in", `gh is not logged in to ${ghHost}; run: gh auth login --scopes read:packages,write:packages`);
  }
  const username = await fetchGhLogin(exec, ghHost, ghBin);
  return { username, secret };
}

/** Reads only the login of the active gh session (no token is requested). */
export async function fetchGhLogin(exec: Executor, ghHost: string, ghBin = "gh"): Promise<string> {
  const user = await exec(ghBin, ["api", "user", "--hostname", ghHost, "--jq", ".login"]);
  if (user.notFound) throw new GhError("missing", "the GitHub CLI (gh) was not found in PATH");
  const username = user.stdout.trim();
  if (user.code !== 0 || !username) {
    throw new GhError("failed", `could not determine the GitHub login for ${ghHost} via gh`);
  }
  return username;
}
