import ts, {
  createProgram,
  createCompilerHost,
  createSourceFile,
  ScriptTarget,
  transform,
} from "typescript";
import type { SourceFile } from "typescript";
import tsc from "typescript-compiler";

import namespaceManager from "../namespace-manager";
import { assignOptions, resetOptions } from "../options";
import type { Options } from "../options";
import { checker } from "../checker";
import * as logger from "../logger";
import { withEnv } from "../env";
import {
  importEqualsTransformer,
  legacyModules,
  declarationFileTransform,
  importTypeToImportDeclaration,
} from "../parse/transformers";
import { recursiveWalkTree } from "../parse";
import { printFlowGenHelper } from "../printers/node";

const compile = withEnv<any, [SourceFile], string>(
  (env: any, sourceFile: SourceFile): string => {
    const rootNode = recursiveWalkTree(sourceFile);

    const output = rootNode
      .getChildren()
      .map(child => {
        return child.print();
      })
      .join("");

    const helpersOutputs = printFlowGenHelper(env);

    return `${helpersOutputs}\n\n${output}`;
  },
);

const reset = (options?: Options): void => {
  resetOptions();
  if (options) {
    assignOptions(options);
  }
  namespaceManager.reset();
};

const compilerOptions = {
  noLib: true,
  target: ScriptTarget.Latest,
};

const getTransformers = (options?: Options) => [
  legacyModules(),
  importEqualsTransformer(),
  declarationFileTransform(options),
  importTypeToImportDeclaration(),
];

const transformFile = (
  fileName: string,
  sourceText: string,
  languageVersion: ScriptTarget,
  options?: Options,
) => {
  const transformedAst = transform(
    //$todo Flow has problems when switching variables instead of literals
    createSourceFile(fileName, sourceText, languageVersion, true),
    getTransformers(options),
    compilerOptions,
  ).transformed[0];
  const transformedText = ts.createPrinter().printFile(transformedAst);
  return createSourceFile(fileName, transformedText, languageVersion, true);
};

/** Return a string that's almost surely different every time. */
const randString = (): string => (Math.random() * 2 ** 54).toString(36);

let total = 0;

/** Inputs to `compileDefinitionString`, indexed by our random filename. */
const definitionInputs: Map<string, { string: string; options?: Options }> =
  new Map();

const sharedCompilerHost = (() => {
  const compilerHost = createCompilerHost({}, true);
  const oldSourceFile = compilerHost.getSourceFile;
  compilerHost.getSourceFile = (file, languageVersion) => {
    const definition = definitionInputs.get(file);
    if (definition !== undefined) {
      const { string, options } = definition;
      return transformFile("/dev/null", string, languageVersion, options);
    }
    return oldSourceFile(file, languageVersion);
  };
  return compilerHost;
})();

/**
 * Compiles typescript files
 */
export default {
  reset,

  compile: compile.withEnv({}),

  setChecker(typeChecker: ts.TypeChecker) {
    checker.current = typeChecker;
  },

  getTransformers(options?: Options) {
    return getTransformers(options);
  },

  compileTest: (path: string, target: string): void => {
    tsc.compile(path, "--module commonjs -t ES6 --out " + target);
  },

  compileDefinitionString: (string: string, options?: Options): string => {
    const marks: [string, number][] = [["start", performance.now()]];
    const mark = (name: string) => marks.push([name, performance.now()]);

    reset(options);

    const definitionPath = `string-${randString()}.ts`;

    definitionInputs.set(definitionPath, { string, options });
    mark("setup");

    const program = createProgram(
      [definitionPath],
      compilerOptions,
      sharedCompilerHost,
    );
    mark("createProgram");

    checker.current = program.getTypeChecker();
    mark("getTypeChecker");
    const sourceFile = program.getSourceFile(definitionPath);

    if (!sourceFile) return "";

    logger.setSourceFile(sourceFile);

    const result = compile.withEnv({})(sourceFile);
    mark("compile");

    const elapsed = marks[marks.length - 1][1] - marks[0][1];
    total += elapsed;
    // console.log(
    //   `compileDefinitionString ${elapsed.toFixed()} total ${total.toFixed()}\n  ` +
    //     marks
    //       .map(([name, t], i) =>
    //         i === 0 ? "" : `${name} ${(t - marks[i - 1][1]).toFixed()}`,
    //       )
    //       .join(" "),
    // );

    return result;
  },

  compileDefinitionFile: (
    path: string,
    options?: Options,
    mapSourceCode: (
      source: string | undefined,
      fileName: string,
    ) => string | undefined = a => a,
  ): string => {
    reset(options);

    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    const oldReadFile = compilerHost.readFile;
    compilerHost.readFile = fileName =>
      mapSourceCode(oldReadFile(fileName), fileName);
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (file === path) {
        const sourceText = compilerHost.readFile(file);
        return transformFile(file, sourceText, languageVersion, options);
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram([path], compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();
    const sourceFile = program.getSourceFile(path);

    if (!sourceFile) return "";

    logger.setSourceFile(sourceFile);

    return compile.withEnv({})(sourceFile);
  },

  compileDefinitionFiles: (
    paths: string[],
    options?: Options,
    mapSourceCode: (
      source: string | undefined,
      fileName: string,
    ) => string | undefined = a => a,
  ): Array<[string, string]> => {
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    const oldReadFile = compilerHost.readFile;
    compilerHost.readFile = fileName =>
      mapSourceCode(oldReadFile(fileName), fileName);
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (paths.includes(file)) {
        const sourceText = compilerHost.readFile(file);
        return transformFile(file, sourceText, languageVersion, options);
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram(paths, compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();

    return paths.map(path => {
      const sourceFile = program.getSourceFile(path);
      if (!sourceFile) return [path, ""];
      logger.setSourceFile(sourceFile);
      reset(options);
      return [path, compile.withEnv({})(sourceFile)];
    });
  },
};
