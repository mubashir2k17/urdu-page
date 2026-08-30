/**
 * Font provider API. The default provider uses an open font fallback; users can
 * register their own provider to supply legitimately licensed InPage fonts
 * (e.g. Noori Nastaliq) for closer fidelity.
 */
export interface FontProvider {
  /** Return exact InPage font-name → bytes mappings for fonts the provider can supply. */
  resolve(inPageFontNames: string[]): Promise<Map<string, Uint8Array>>;
  /** Return the default fallback font bytes (must be supplied by all providers). */
  getFallback(): Promise<Uint8Array>;
}

const providers: FontProvider[] = [];

/**
 * Register a provider and return a cleanup function for scoped registrations.
 * Newer registrations take priority when rendering without an explicit font.
 */
export function registerFontProvider(provider: FontProvider): () => void {
  providers.push(provider);
  return () => {
    const index = providers.lastIndexOf(provider);
    if (index >= 0) providers.splice(index, 1);
  };
}

export function getFontProviders(): readonly FontProvider[] {
  return providers;
}

/** Resolve the first document font supplied by the newest matching provider. */
export async function resolveProvidedFont(
  inPageFontNames: string[],
): Promise<Uint8Array | undefined> {
  const prioritizedProviders = [...providers].reverse();

  for (const provider of prioritizedProviders) {
    const resolved = await provider.resolve(inPageFontNames);
    for (const fontName of inPageFontNames) {
      const bytes = resolved.get(fontName);
      if (bytes) return bytes;
    }
  }

  return prioritizedProviders[0]?.getFallback();
}
