import * as ts from "typescript";
import { stripDetailsFromTree } from "./ast";
import type { Options } from "../options";
import factory from "../nodes/factory";

function updatePos<T extends ts.Node>(node: T) {
  // @ts-expect-error todo: modifying "readonly" property
  node.pos = 1;
  // @ts-expect-error todo: modifying "readonly" property
  node.end = 2;
  return node;
}

export function importEqualsTransformer /*opts?: Opts*/() {
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportEqualsDeclaration(node)) {
        if (
          node.moduleReference.kind === ts.SyntaxKind.ExternalModuleReference
        ) {
          const importClause = ts.createImportClause(
            undefined,
            ts.createNamespaceImport(ts.createIdentifier(node.name.text)),
          );
          const moduleSpecifier = ts.createLiteral(
            // @ts-expect-error todo(flow->ts)
            node.moduleReference.expression.text,
          );
          const importNode = updatePos(
            //$todo Flow has problems when switching variables instead of literals
            ts.createImportDeclaration(
              undefined,
              undefined,
              //$todo Flow has problems when switching variables instead of literals
              updatePos(importClause),
              //$todo Flow has problems when switching variables instead of literals
              updatePos(moduleSpecifier),
            ),
          );
          return importNode;
        } else if (node.moduleReference.kind === ts.SyntaxKind.QualifiedName) {
          const varNode = updatePos(
            //$todo Flow has problems when switching variables instead of literals
            ts.createVariableStatement(node.modifiers, [
              ts.createVariableDeclaration(
                node.name,
                //$todo Flow has problems when switching variables instead of literals
                ts.createTypeQueryNode(node.moduleReference),
                undefined,
              ),
            ]),
          );
          return varNode;
        }
      }
      return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
  }
  return (ctx: ts.TransformationContext): ts.Transformer<any> => {
    return (sf: ts.SourceFile) => ts.visitNode(sf, visitor(ctx));
  };
}

export function legacyModules() {
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      stripDetailsFromTree(node);
      if (ts.isModuleDeclaration(node)) {
        if (node.name.kind === ts.SyntaxKind.Identifier) {
          // @ts-expect-error todo: modifying "readonly" property
          node.flags |= ts.NodeFlags.Namespace;
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
          ctx.factory.createIdentifier(options.asModule),
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
  /* // Reversible because:
  assert(
    name ===
      escapedName.replace(/_[^_]*_/g, s =>
        String.fromCodePoint(Number.parseInt(s.substring(1), 16)),
      ),
  );
  */

  // Then we delimit the prefix from the escaped name with `$`, which lacks
  // `ID_Continue` and therefore cannot appear in the escaped name.
  return prefix + "$" + escapedName;
}

export function importTypeToImportDeclaration() {
  function visitor(ctx: ts.TransformationContext) {
    const imports = new Map();
    const visitor: ts.Visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isImportTypeNode(node)) {
        if (
          !ts.isLiteralTypeNode(node.argument) ||
          !ts.isStringLiteral(node.argument.literal)
        )
          throw null; // TODO better exception

        const importSource = node.argument.literal.text;
        let identifier;
        if (!imports.has(importSource)) {
          identifier = ctx.factory.createIdentifier(
            escapeNameAsIdentifierWithPrefix("$Flowgen$Import", importSource),
          );
          const decl =
            // import * as ${identifier} from ${node.argument};
            ctx.factory.createImportDeclaration(
              undefined,
              undefined,
              ctx.factory.createImportClause(
                false,
                undefined,
                ctx.factory.createNamespaceImport(identifier),
              ),
              node.argument.literal,
            );
          // console.log(decl.importClause.namedBindings.name);
          imports.set(importSource, { identifier, decl });
        } else {
          identifier = imports.get(importSource).identifier;
        }
        // console.log({ importSource, identifier });

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
        // console.log(imports);
        return ctx.factory.updateSourceFile(visited, [
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

/**
 * Expand some TS-specific React type aliases to a more compatible form.
 *
 * See also the transformations done on individual names, controlled in
 * `src/printers/smart-identifiers.ts`.
 */
export function expandReactTypes(
  program: ts.Program,
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker();
  function visitor(ctx: ts.TransformationContext) {
    const visitor: ts.Visitor = node => {
      if (ts.isTypeReferenceNode(node) && ts.isQualifiedName(node.typeName)) {
        console.log(node.typeName);
        const symbol = checker.getSymbolAtLocation(node.typeName);
        // const decl = symbol.declarations[0];
        // console.log(checker.getTypeAtLocation(node.typeName));
        // return node;
      }
      return ts.visitEachChild(node, visitor, ctx);
    };
    return visitor;
  }
  return ctx => sf => ts.visitNode(sf, visitor(ctx));
}
