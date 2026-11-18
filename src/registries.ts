/** Registries served by this helper, mapped to the gh host that owns them. */
const SUPPORTED_HOSTS: Record<string, string> = {
  "ghcr.io": "github.com",
  "docker.pkg.github.com": "github.com",
};

/** Canonical server URLs reported by `list`. */
export const LIST_URLS = ["https://ghcr.io", "https://docker.pkg.github.com"];

/**
 * Extracts the lowercase hostname from the server URL that Docker passes on
 * stdin. Returns null if unparseable, or if the URL uses a scheme other than
 * https, a non-default port, or embedded user:pass@ credentials.
 */
export function hostnameOf(serverURL: string): string | null {
  const raw = serverURL.trim();
  if (!raw) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    // Only plain https on the default port, without credentials, is accepted.
    if (u.protocol !== "https:" || u.port !== "" || u.username !== "" || u.password !== "") return null;
    return u.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Returns the gh hostname for a supported registry, or null if unsupported. */
export function ghHostFor(serverURL: string): string | null {
  const host = hostnameOf(serverURL);
  if (host === null) return null;
  return Object.prototype.hasOwnProperty.call(SUPPORTED_HOSTS, host) ? SUPPORTED_HOSTS[host] : null;
}
