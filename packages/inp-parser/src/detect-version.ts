import type { InPageVersion } from "@inpage/document-model";
import type { CfbFile } from "@inpage/cfb";

export const CONTENT_STREAM_NAMES: Record<string, InPageVersion> = {
  InPage100: 1,
  InPage200: 2,
  InPage300: 3,
};

export function detectVersion(cfb: CfbFile): InPageVersion | null {
  for (const name of ["InPage300", "InPage200", "InPage100"] as const) {
    if (cfb.byPath.has(name)) {
      return CONTENT_STREAM_NAMES[name]!;
    }
  }
  return null;
}
