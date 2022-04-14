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

const getTransformers = (options?: Options) => [
  legacyModules(),
  importEqualsTransformer(),
  declarationFileTransform(options),
  importTypeToImportDeclaration(),
];

/**
 * Compiles typescript files
 */
export default {
  reset,

  compile: compile.withEnv({}),

  setChecker(typeChecker: any) {
    checker.current = typeChecker;
  },

  getTransformers(options?: Options) {
    return getTransformers(options);
  },

  compileTest: (path: string, target: string): void => {
    tsc.compile(path, "--module commonjs -t ES6 --out " + target);
  },

  compileDefinitionString: (string: string, options?: Options): string => {
    reset(options);

    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (file === "file.ts") {
        // TODO clean this up, and do at other sites below
        const tt = transform(
          //$todo Flow has problems when switching variables instead of literals
          createSourceFile("/dev/null", string, languageVersion, true),
          getTransformers(options),
          compilerOptions,
        ).transformed[0];
        const ss = ts.createPrinter().printFile(tt);
        // console.log(ss);
        return createSourceFile("/dev/null", ss, languageVersion, true);
      }
      return oldSourceFile(file, languageVersion);
    };

    const program = createProgram(["file.ts"], compilerOptions, compilerHost);

    checker.current = program.getTypeChecker();
    const sourceFile = program.getSourceFile("file.ts");
    // const node = sourceFile.statements[2].type.typeName;
    // console.log(
    //   node,
    //   checker.current.getSymbolsInScope(node, undefined),
    //   checker.current.getSymbolAtLocation(node),
    // );

    if (!sourceFile) return "";

    logger.setSourceFile(sourceFile);

    return compile.withEnv({})(sourceFile);
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

    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    const oldReadFile = compilerHost.readFile;
    compilerHost.readFile = fileName =>
      mapSourceCode(oldReadFile(fileName), fileName);
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (file === path) {
        const transformedAst = transform(
          //$todo Flow has problems when switching variables instead of literals
          createSourceFile(
            file,
            compilerHost.readFile(file),
            languageVersion,
            true,
          ),
          getTransformers(options),
          compilerOptions,
        ).transformed[0];
        const transformedText = ts.createPrinter().printFile(transformedAst);
        return createSourceFile(file, transformedText, languageVersion, true);
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
    const compilerOptions = {
      noLib: true,
      target: ScriptTarget.Latest,
    };
    const compilerHost = createCompilerHost({}, true);
    const oldSourceFile = compilerHost.getSourceFile;
    const oldReadFile = compilerHost.readFile;
    compilerHost.readFile = fileName =>
      mapSourceCode(oldReadFile(fileName), fileName);
    compilerHost.getSourceFile = (file, languageVersion) => {
      if (paths.includes(file)) {
        return transform(
          //$todo Flow has problems when switching variables instead of literals
          createSourceFile(
            file,
            compilerHost.readFile(file),
            languageVersion,
            true,
          ),
          getTransformers(options),
          compilerOptions,
        ).transformed[0];
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
