/** Error types for CFB parsing. */
export class CfbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CfbError";
  }
}

export class CfbSecurityError extends CfbError {
  constructor(message: string) {
    super(message);
    this.name = "CfbSecurityError";
  }
}

export class CfbLimitError extends CfbError {
  constructor(message: string) {
    super(message);
    this.name = "CfbLimitError";
  }
}
