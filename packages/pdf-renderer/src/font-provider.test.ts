import { describe, expect, it } from "vitest";

import { registerFontProvider, resolveProvidedFont } from "./font-provider.js";

describe("font providers", () => {
  it("prefers the newest exact match and supports scoped cleanup", async () => {
    const olderBytes = new Uint8Array([1]);
    const newerBytes = new Uint8Array([2]);
    const unregisterOlder = registerFontProvider({
      async resolve() {
        return new Map([["Noori Nastaliq", olderBytes]]);
      },
      async getFallback() {
        return olderBytes;
      },
    });
    const unregisterNewer = registerFontProvider({
      async resolve() {
        return new Map([["Noori Nastaliq", newerBytes]]);
      },
      async getFallback() {
        return newerBytes;
      },
    });

    try {
      await expect(resolveProvidedFont(["Noori Nastaliq"])).resolves.toBe(newerBytes);
      unregisterNewer();
      await expect(resolveProvidedFont(["Noori Nastaliq"])).resolves.toBe(olderBytes);
    } finally {
      unregisterNewer();
      unregisterOlder();
    }
  });

  it("uses the newest provider fallback when no exact name matches", async () => {
    const fallbackBytes = new Uint8Array([3]);
    const unregister = registerFontProvider({
      async resolve() {
        return new Map();
      },
      async getFallback() {
        return fallbackBytes;
      },
    });

    try {
      await expect(resolveProvidedFont(["Unknown Font"])).resolves.toBe(fallbackBytes);
    } finally {
      unregister();
    }
  });
});
