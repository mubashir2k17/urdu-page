import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectInPage, openInPage, extractText, renderPdf, setDefaultFallbackFont } from "@inpage/converter";
import { NodeFallbackFont } from "@inpage/pdf-renderer";
import { readCfb } from "@inpage/cfb";

interface Args {
  command: "convert" | "inspect" | "extract" | "render";
  input: string;
  output?: string | undefined;
  pages?: string | undefined;
  format?: string | undefined;
}

function usage(): never {
  console.error(`Usage:
  inp2pdf input.inp --output output.pdf
  inp2pdf inspect input.inp
  inp2pdf extract input.inp --output output.txt
  inp2pdf render input.inp --pages 1-3 --format png
`);
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0) usage();
  const first = argv[0]!;

  // `inp2pdf inspect input.inp` form.
  if (first === "inspect" || first === "extract" || first === "render") {
    const command = first;
    const input = argv[1]!;
    let output: string | undefined;
    let pages: string | undefined;
    let format: string | undefined;
    for (let i = 2; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === "--output") output = argv[++i];
      else if (a === "--pages") pages = argv[++i];
      else if (a === "--format") format = argv[++i];
    }
    return { command, input, output, pages, format };
  }

  // `inp2pdf input.inp --output output.pdf` form.
  const input = first;
  let output: string | undefined;
  let pages: string | undefined;
  let format: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--output") output = argv[++i];
    else if (a === "--pages") pages = argv[++i];
    else if (a === "--format") format = argv[++i];
  }
  return { command: "convert", input, output, pages, format };
}

function loadFont(): NodeFallbackFont {
  return new NodeFallbackFont(async () => {
    const { readFileSync } = await import("node:fs");
    const fontPath = resolve(process.cwd(), "fonts/NotoNastaliqUrdu-Regular.ttf");
    return new Uint8Array(readFileSync(fontPath));
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const data = new Uint8Array(readFileSync(resolve(args.input)));

  setDefaultFallbackFont(loadFont());

  switch (args.command) {
    case "convert": {
      const doc = await openInPage(data, { strict: false });
      const bytes = await renderPdf(
        doc,
        { preservePageSize: true, embedFonts: true, searchableText: true },
        loadFont(),
      );
      const outPath = args.output ?? args.input.replace(/\.inp$/i, ".pdf");
      writeFileSync(resolve(outPath), bytes);
      console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
      break;
    }
    case "inspect": {
      const report = await inspectInPage(data);
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    case "extract": {
      const doc = await openInPage(data, { strict: false });
      const text = extractText(doc);
      const outPath = args.output ?? args.input.replace(/\.inp$/i, ".txt");
      writeFileSync(resolve(outPath), text.raw, "utf8");
      console.log(`Wrote ${outPath}`);
      break;
    }
    case "render": {
      console.error("render (PNG) is not yet implemented (phase 2).");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
