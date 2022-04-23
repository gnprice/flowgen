/**
 * Quick REPL for exploring TS with a ts.TypeChecker handy.
 *
 * Sample usage:
   $ node lib/repl.js
     // Parse a sample program, and get a type-checker on it.
   > [ch, f] = quickSourceFile(`
       namespace n {
         export namespace m {
           export type A = number; } }
       type T = n.m.A;`); 1
   1
     // The qualified-name `n.m.A` from the sample program.
   > nma = f.statements[1].type.typeName; ts.isQualifiedName(nma)
   true
     // The symbol at `n.m` is the parent of the symbol at `n.m.A`.
   > ch.getSymbolAtLocation(nma.left) === ch.getSymbolAtLocation(nma).parent
   true
 */
import os from "os";
import path from "path";
import repl from "repl";
import ts from "typescript";

export function quickProgram(map: Map<string, string>): ts.Program {
  const compilerHost = ts.createCompilerHost({}, true);
  const oldSourceFile = compilerHost.getSourceFile;
  compilerHost.getSourceFile = (file, languageVersion) => {
    const sourceText = map.get(file);
    if (sourceText !== undefined) {
      return ts.createSourceFile(file, sourceText, languageVersion, true);
    }
    return oldSourceFile(file, languageVersion);
  };
  // @ts-expect-error iterating an iterator
  return ts.createProgram([...map.keys()], {}, compilerHost);
}

export function quickSourceFile(
  sourceText: string,
): [ts.TypeChecker, ts.SourceFile] {
  const program = quickProgram(new Map([["file.ts", sourceText]]));
  return [program.getTypeChecker(), program.getSourceFile("file.ts")];
}

const r = repl.start();

// Share history with the plain `node` REPL.
r.setupHistory(path.join(os.homedir(), ".node_repl_history"), () => undefined);

Object.assign(r.context, {
  quickProgram,
  quickSourceFile,
  ts,
});
