/**
 * Quick REPL for exploring TS with a ts.TypeChecker handy.
 *
 * Sample usage:
   $ node lib/repl.js
     // Parse a sample program, and get a type-checker on it.
   > [ch, f] = quickSourceFile(`namespace n { export type A = number; } type T = n.A;`); 1
   1
     // The qualified-name `n.A` from the sample program.
   > na = f.statements[1].type.typeName; ts.isQualifiedName(na)
   true
     // The symbol at `n` is the parent of the symbol at `n.A`.
   > ch.getSymbolAtLocation(na.left) === ch.getSymbolAtLocation(na).parent
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

     // hooray, import works!
   > fb.resolvedModules
   Map(1) {
     './a' => {
       resolvedFileName: '/tmp/2xt67quttrs/a.ts',
       originalPath: undefined,
       extension: '.ts',
       isExternalLibraryImport: false,
       packageId: undefined
     }
   }
     // TODO write more here

     // The symbol at the `propertyName` has its declaration back in `a.ts`:
   > ch.getSymbolAtLocation(el.propertyName).declarations[0] === fa.statements[0]
   true

     // That symbol's parent is the symbol for the `a.ts` module itself:
   > ch.getSymbolAtLocation(el.propertyName).parent === fa.symbol
   true

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
  const oldDirectoryExists = compilerHost.directoryExists;
  const oldFileExists = compilerHost.fileExists;
  const oldSourceFile = compilerHost.getSourceFile;
  compilerHost.directoryExists = path => {
    // TODO extend to handle subdirectories
    return path === basePath || oldDirectoryExists(path);
  };
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

  const program = ts.createProgram(
    // @ts-expect-error iterating an iterator
    [...map.keys()],
    { target: ts.ScriptTarget.Latest }, // { traceResolution: true },
    compilerHost,
  );
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

const r = repl.start({
  // @ts-expect-error historySize is in fact accepted; see e.g. implementation:
  //   https://github.com/nodejs/node/blob/v18.0.0/lib/repl.js#L768
  historySize: 1000,
});

// Share history with the plain `node` REPL.
r.setupHistory(path.join(os.homedir(), ".node_repl_history"), () => undefined);

Object.assign(r.context, {
  quickProgram,
  quickSourceFile,
  ts,
});
