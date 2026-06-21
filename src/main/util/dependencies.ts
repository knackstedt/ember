export interface DependencyVersion {
  name: string;
  version: string;
}

/**
 * Extracts the production runtime dependencies from a package.json object and
 * returns them as alphabetically sorted name/version pairs.
 */
export function getDependencyVersions(pkg: {
  dependencies?: Record<string, string>;
}): DependencyVersion[] {
  const deps = pkg.dependencies ?? {};
  return Object.entries(deps)
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
