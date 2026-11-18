import { Executor, fetchGhCredentials, fetchGhLogin, GhError } from "./gh";
import { ghHostFor, LIST_URLS } from "./registries";

export interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

/** Exact message Docker's client library recognises as "no credentials". */
export const NOT_FOUND = "credentials not found in native keychain";

export interface Deps {
  exec: Executor;
  ghBin?: string;
}

/** Runs one credential helper command. `input` is the full stdin text. */
export async function run(command: string, input: string, deps: Deps): Promise<Outcome> {
  switch (command) {
    case "get":
      return get(input, deps);
    case "store":
      // Documented no-op: nothing is ever persisted by this helper.
      return { code: 0, stdout: "", stderr: "" };
    case "erase":
      // Documented no-op: there is nothing stored to erase.
      return { code: 0, stdout: "", stderr: "" };
    case "list": {
      // Only advertise registries when gh has a working session; otherwise
      // return an empty map so Docker does not believe credentials exist.
      // Only the login is requested here, never the token.
      const map: Record<string, string> = {};
      try {
        const username = await fetchGhLogin(deps.exec, "github.com", deps.ghBin);
        for (const u of LIST_URLS) map[u] = username;
      } catch {
        // empty map
      }
      return { code: 0, stdout: JSON.stringify(map) + "\n", stderr: "" };
    }
    case "version":
    case "--version":
      return { code: 0, stdout: "docker-credential-gh 0.1.0\n", stderr: "" };
    default:
      return {
        code: 1,
        stdout: "",
        stderr: `unknown command: ${command}\nusage: docker-credential-gh <get|store|erase|list>\n`,
      };
  }
}

async function get(input: string, deps: Deps): Promise<Outcome> {
  const serverURL = input.trim();
  const ghHost = ghHostFor(serverURL);
  // Docker's client matches this message on the helper's STDOUT (see
  // docker-credential-helpers: client.Get / IsErrCredentialsNotFoundMessage).
  if (ghHost === null) return { code: 1, stdout: NOT_FOUND + "\n", stderr: "" };
  try {
    const { username, secret } = await fetchGhCredentials(deps.exec, ghHost, deps.ghBin);
    const body = JSON.stringify({ ServerURL: serverURL, Username: username, Secret: secret });
    return { code: 0, stdout: body + "\n", stderr: "" };
  } catch (e) {
    const msg = e instanceof GhError ? e.message : "unexpected error while calling gh";
    // Docker only surfaces the helper's stdout in its error message.
    return { code: 1, stdout: `docker-credential-gh: ${msg}\n`, stderr: "" };
  }
}
