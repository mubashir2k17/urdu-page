export type Severity = "info" | "warning" | "error";

export type DiagnosticCategory =
  | "parsing"
  | "encoding"
  | "font-substitution"
  | "shaping"
  | "line-breaking"
  | "pagination"
  | "object-placement"
  | "image-decoding"
  | "unsupported-feature"
  | "security";

export interface Diagnostic {
  severity: Severity;
  category: DiagnosticCategory;
  code: string;
  message: string;
  /** Byte offset in the source stream, if known. */
  offset?: number;
  /** Additional structured context (never file contents). */
  detail?: Record<string, unknown>;
}

export interface DiagnosticCollector {
  readonly diagnostics: readonly Diagnostic[];
  info(category: DiagnosticCategory, code: string, message: string, extra?: Omit<Diagnostic, "severity" | "category" | "code" | "message">): void;
  warn(category: DiagnosticCategory, code: string, message: string, extra?: Omit<Diagnostic, "severity" | "category" | "code" | "message">): void;
  error(category: DiagnosticCategory, code: string, message: string, extra?: Omit<Diagnostic, "severity" | "category" | "code" | "message">): void;
  hasErrors(): boolean;
}

export function createDiagnosticCollector(): DiagnosticCollector {
  const diagnostics: Diagnostic[] = [];

  function push(
    severity: Severity,
    category: DiagnosticCategory,
    code: string,
    message: string,
    extra?: Omit<Diagnostic, "severity" | "category" | "code" | "message">,
  ): void {
    diagnostics.push({ severity, category, code, message, ...extra });
  }

  return {
    get diagnostics() {
      return diagnostics;
    },
    info: (category, code, message, extra) => push("info", category, code, message, extra),
    warn: (category, code, message, extra) => push("warning", category, code, message, extra),
    error: (category, code, message, extra) => push("error", category, code, message, extra),
    hasErrors: () => diagnostics.some((d) => d.severity === "error"),
  };
}
