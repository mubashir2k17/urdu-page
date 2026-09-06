import { resolve } from "node:path";
import { importInPageFonts } from "./inpage-fonts.js";

const source = process.argv[2];
if (!source) throw new Error('Usage: npm run fonts:import -- "/path/to/Inpage 2018"');
importInPageFonts(resolve(source), resolve("fonts/inpage-local"));
