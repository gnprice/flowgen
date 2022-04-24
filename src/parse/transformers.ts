import * as ts from "typescript";
import { stripDetailsFromTree } from "./ast";
import type { Options } from "../options";
import * as logger from "../logger";

function updatePos<T extends ts.Node>(node: T) {
  // @ts-expect-error todo: modifying "readonly" property
  node.pos = 1;
  // @ts-expect-error todo: modifying "readonly" property
  node.end = 2;
  return node;
}

/**
 * Transform away `import x = …` statements.
 *
 * `import x = require('y')` becomes `import * as x from 'y'`.
 *
 * `import x = y.z` becomes `var x: typeof y.z`.
 */
export function importEqualsTransformer /*opts?: Opts*/() {
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportEqualsDeclaration(node)) {
        if (
          node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference
        ) {
          // The declaration is of the form `import x = require('y')`.
          // Generate `import * as x from 'y'`.
          const importClause = ts.createImportClause(
            undefined,
            ts.createNamespaceImport(ts.createIdentifier(node.name.text)),
          );
          const moduleSpecifier = ts.createLiteral(
            // The expression is always a string literal.  This isn't stated
            // on the `ExternalModuleReference` type; but it's done the same
            // way on the module specifier on `ImportDeclaration`, and the
            // comment in parseModuleSpecifier (called by
            // parseExternalModuleReference) in TS's src/compiler/parser.ts
            // says it gets checked in the grammar check pass.
            (node.moduleReference.expression as ts.StringLiteral).text,
          );
          const importNode = updatePos(
            ts.createImportDeclaration(
              undefined,
              undefined,
              updatePos(importClause),
              updatePos(moduleSpecifier),
            ),
          );
          return importNode;
        } else if (node.moduleReference.kind === ts.SyntaxKind.QualifiedName) {
          // The declaration is of the form `import x = y.z`.  Docs:
          //   https://www.typescriptlang.org/docs/handbook/namespaces.html#aliases
          // Generate `var x: typeof y.z`.
          const varNode = updatePos(
            ts.createVariableStatement(node.modifiers, [
              ts.createVariableDeclaration(
                node.name,
                ts.createTypeQueryNode(node.moduleReference),
                undefined,
              ),
            ]),
          );
          return varNode;
        }
        // TODO: What if node.moduleReference is a ts.Identifier?
        //   Probably should treat that the same as a QualifiedName.
      }
      return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
  }
  return (ctx: ts.TransformationContext): ts.Transformer<any> => {
    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx));
  };
}

/**
 * Convert legacy `module foo` syntax to `namespace foo`.
 *
 * These mean the same thing.  The `module` form is the legacy form from
 * before TypeScript 1.5.  Upstream docs:
 *   https://www.typescriptlang.org/docs/handbook/namespaces.html
 */
export function legacyModules() {
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      stripDetailsFromTree(node);

      if (ts.isModuleDeclaration(node)) {
        if (node.name.kind === ts.SyntaxKind.Identifier) {
          // This is a `module foo` or `namespace foo`.  Make it the latter.

          // @ts-expect-error todo: modifying "readonly" property
          node.flags |= ts.NodeFlags.Namespace;
        } else {
          // This is an "ambient external module declaration", with syntax
          // `module 'foo'` (a string literal rather than an identifier.)
          // Do nothing.
        }

        visitor(node.body);
        return node;
      }

      return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
  }
  return (ctx: ts.TransformationContext): ts.Transformer<any> => {
    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx));
  };
}

export function declarationFileTransform(options?: Options) {
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (!options?.asModule || !ts.isSourceFile(node)) {
        return node;
      }

      if (
        node.statements.some(statement => ts.isModuleDeclaration(statement))
      ) {
        return node;
      }

      return ctx.factory.updateSourceFile(node, [
        ctx.factory.createModuleDeclaration(
          undefined,
          undefined,
          ctx.factory.createStringLiteral(options.asModule),
          ctx.factory.createModuleBlock(
            node.statements.map(statement => {
              if (statement.modifiers) {
                // @ts-expect-error
                statement.modifiers = statement.modifiers.filter(
                  modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword,
                );
              }

              return statement;
            }),
          ),
        ),
      ]);
    };
    return visitor;
  }
  return (ctx: ts.TransformationContext): ts.Transformer<any> => {
    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx));
  };
}

/** Like `ctx.factory.createQualifiedName`, but put identifier at start instead of end. */
function prependIdentifier(
  ctx: ts.TransformationContext,
  id: ts.Identifier,
  qualifier: ts.EntityName | undefined,
): ts.EntityName {
  if (!qualifier) {
    return id;
  } else if (qualifier.kind === ts.SyntaxKind.Identifier) {
    return ctx.factory.createQualifiedName(id, qualifier);
  } else {
    return ctx.factory.createQualifiedName(
      prependIdentifier(ctx, id, qualifier.left),
      qualifier.right,
    );
  }
}

/**
 * Make a deterministic, unique, JS-valid identifier based on the given string.
 *
 * The result is a string which begins with `prefix` and can be used as a
 * JavaScript identifier name.  It's always the same when called with the
 * same arguments, and always different when called with different
 * arguments.
 *
 * The argument `prefix` is required to be a valid JS identifier name.
 */
function escapeNameAsIdentifierWithPrefix(
  prefix: string,
  name: string,
): string {
  // The set of valid JS identifier names is defined here:
  //   https://tc39.es/ecma262/#prod-IdentifierName
  // In particular, after the first character, each character can be `$`
  // or any character with the `ID_Continue` Unicode property, among others.

  // For our construction:
  //  * Characters in `name` with `ID_Continue`, other than `_`, we use
  //    verbatim.
  //  * Other characters we replace with an escape sequence, marked by `_`.
  // This provides a string where all characters have `ID_Continue`, as an
  // invertible function of `name`.
  const escapedName = name.replace(
    /\P{ID_Continue}|_/gu,
    c => `_${c.codePointAt(0).toString(16)}_`,
  );
  // This escaping always gives different results for different inputs,
  // because the following code would reconstruct the input:
  //   assert(
  //     name ===
  //       escapedName.replace(/_[^_]*_/g, s =>
  //         String.fromCodePoint(Number.parseInt(s.substring(1), 16)),
  //       ),
  //   );

  // Then we delimit the prefix from the escaped name with `$`, which lacks
  // `ID_Continue` and therefore cannot appear in the escaped name.
  return prefix + "$" + escapedName;
}

/**
 * Rewrite `import(…)` types into full import declarations.
 *
 * Flow doesn't have an equivalent to `import(…)` types.
 */
export function importTypeToImportDeclaration() {
  function visitor(ctx: ts.TransformationContext) {
    const imports = new Map();
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportTypeNode(node)) {
        if (
          !ts.isLiteralTypeNode(node.argument) ||
          !ts.isStringLiteral(node.argument.literal)
        ) {
          // TS (as of 4.6.2) gives an error if the argument to `import(…)`
          // isn't a string literal, saying "String literal expected."
          // So this case should be impossible.
          logger.error(node, {
            type: "UnexpectedTsSyntax",
            description: "import(…) type with argument not a string literal",
          });
          return ts.visitEachChild(node, visitor, ctx);
        }

        const importSource = node.argument.literal.text;
        let identifier;
        if (!imports.has(importSource)) {
          identifier = ctx.factory.createIdentifier(
            escapeNameAsIdentifierWithPrefix("$Flowgen$Import", importSource),
          );
          // Construct an import statement like this:
          //   import * as ${identifier} from ${node.argument};
          const decl = ctx.factory.createImportDeclaration(
            undefined,
            undefined,
            ctx.factory.createImportClause(
              false,
              undefined,
              ctx.factory.createNamespaceImport(identifier),
            ),
            node.argument.literal,
          );
          imports.set(importSource, { identifier, decl });
        } else {
          identifier = imports.get(importSource).identifier;
        }

        if (!node.qualifier) {
          // The reference is to the module as a whole, as a type.
          // Must need a `typeof`.
          if (node.typeArguments)
            throw new Error(
              "impossible syntax: type arguments applied to a module",
            );
          return ctx.factory.createTypeOfExpression(identifier);
        } else {
          // The reference is to something inside the module.
          return ctx.factory.createTypeReferenceNode(
            prependIdentifier(ctx, identifier, node.qualifier),
            ts.visitNodes(node.typeArguments, visitor),
          );
        }
      }

      if (ts.isSourceFile(node)) {
        const visited = ts.visitEachChild(node, visitor, ctx);
        if (!imports.size) {
          return visited;
        }
        return ctx.factory.updateSourceFile(visited, [
          // @ts-expect-error
          ...[...imports.values()].map(v => v.decl),
          ...visited.statements,
        ]);
      }

      return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
  }
  return (ctx: ts.TransformationContext): ts.Transformer<any> => {
    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx));
  };
}
