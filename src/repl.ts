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


     // Parse and type-check a program with one file importing from another.
   > [ch, ff] = quickProgram(new Map([['a.ts', `export type A = number`], ['b.ts', `import { A as AA } from './a'`]])); 1
   1
   > [fa, fb] = [ff.get('a.ts'), ff.get('b.ts')]; 1
   1
     // The import of `A as AA`.
   > el = fb.statements[0].importClause.namedBindings.elements[0]; ts.SyntaxKind[el.kind]
   'ImportSpecifier'
     // Its `name` is the local name; `propertyName` is the name it had on the module.
   > [el.name.text, el.propertyName.text]
   [ 'AA', 'A' ]
     // Its `symbol` is just the symbol at its `name`.
   > el.symbol === ch.getSymbolAtLocation(el.name)
   true
     // Its symbol's declaration is this ImportSpecifier itself.
   > el.symbol.declarations[0] === el
   true

     // TODO but the actual import isn't working, hmmm:
   > fb.resolvedModules
   Map(1) { './a' => undefined }



 */
import os from "os";
import path from "path";
import repl from "repl";
import ts from "typescript";

/** Return a string that's almost surely different every time. */
const randString = (): string => (Math.random() * 2 ** 54).toString(36);

export function quickProgram(
  map: Map<string, string>,
): [ts.TypeChecker, Map<string, ts.SourceFile>] {
  const basePath = `/tmp/${randString()}`;
  // @ts-expect-error iterating an iterator
  const origNames = [...map.keys()];
  map = new Map(
    origNames.map(name => [path.join(basePath, name), map.get(name)]),
  );

  const compilerHost = ts.createCompilerHost({}, true);
  const oldFileExists = compilerHost.fileExists;
  const oldSourceFile = compilerHost.getSourceFile;
  compilerHost.fileExists = fileName => {
    return map.has(fileName) || oldFileExists(fileName);
  };
  compilerHost.getSourceFile = (file, languageVersion) => {
    const sourceText = map.get(file);
    if (sourceText !== undefined) {
      return ts.createSourceFile(file, sourceText, languageVersion, true);
    }
    return oldSourceFile(file, languageVersion);
  };

  // @ts-expect-error iterating an iterator
  const program = ts.createProgram([...map.keys()], {}, compilerHost);
  return [
    program.getTypeChecker(),
    new Map(
      origNames.map(name => [
        name,
        program.getSourceFile(path.join(basePath, name)),
      ]),
    ),
  ];
}

export function quickSourceFile(
  sourceText: string,
): [ts.TypeChecker, ts.SourceFile] {
  const [checker, sourceFiles] = quickProgram(
    new Map([["file.ts", sourceText]]),
  );
  return [checker, sourceFiles.get("file.ts")];
}

const r = repl.start();

// Share history with the plain `node` REPL.
r.setupHistory(path.join(os.homedir(), ".node_repl_history"), () => undefined);

Object.assign(r.context, {
  quickProgram,
  quickSourceFile,
  ts,
});
