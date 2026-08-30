import { CfbSecurityError } from "@inpage/cfb";
import { CFB_MAGIC } from "@inpage/cfb";

const EGG_HUNTER = [0x68, 0x72, 0x68, 0x72]; // "hrhr"
const SHELLCODE_MARKER = [0x4c, 0x75, 0x4e, 0x64, 0x4c, 0x75, 0x4e, 0x64]; // "LuNdLuNd"

export interface SecurityLimits {
  minFileSize: number;
  maxFileSize: number;
}

export const DEFAULT_SECURITY_LIMITS: SecurityLimits = {
  minFileSize: 512,
  maxFileSize: 50 * 1024 * 1024,
};

/**
 * Validate an InPage file before any parsing. Throws on hostile input.
 * Never leaks file contents in error messages.
 */
export function validateInPageFile(
  data: Uint8Array,
  limits: SecurityLimits = DEFAULT_SECURITY_LIMITS,
): void {
  if (data.length < limits.minFileSize) {
    throw new CfbSecurityError(`File too small (${data.length} bytes)`);
  }
  if (data.length > limits.maxFileSize) {
    throw new CfbSecurityError(`File too large (${data.length} bytes)`);
  }
  for (let i = 0; i < CFB_MAGIC.length; i++) {
    if (data[i] !== CFB_MAGIC[i]) {
      throw new CfbSecurityError("Not a valid InPage file (bad CFB magic)");
    }
  }
  if (containsPattern(data, EGG_HUNTER)) {
    throw new CfbSecurityError("SECURITY: exploit pattern detected (egg-hunter marker)");
  }
  if (containsPattern(data, SHELLCODE_MARKER)) {
    throw new CfbSecurityError("SECURITY: exploit pattern detected (LuNdLuNd shellcode marker)");
  }
}

function containsPattern(data: Uint8Array, pattern: number[]): boolean {
  outer: for (let i = 0; i <= data.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) continue outer;
    }
    return true;
  }
  return false;
}
