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
        const importSourceReduced = importSource.replace(/[@/.-]/g, "_");
        let identifier;
        if (!imports.has(importSource)) {
          identifier = ctx.factory.createUniqueName(
            `$Flowgen$Import$${importSource}`,
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
          console.log(decl.importClause.namedBindings.name);
          imports.set(importSource, { identifier, decl });
        } else {
          identifier = imports.get(importSource).identifier;
        }
        console.log({ importSource, identifier });

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
          const qualifiedName = prependIdentifier(
            ctx,
            identifier,
            node.qualifier,
          );
          const replaced = ctx.factory.createTypeReferenceNode(
            qualifiedName,
            node.typeArguments,
          );
          // console.log({ node, replaced });
          return replaced;
        }
      }

      if (ts.isSourceFile(node)) {
        const visited = ts.visitEachChild(node, visitor, ctx);
        if (!imports.size) {
          return visited;
        }
        // console.log(imports);
        return ctx.factory.updateSourceFile(visited, [
          ...imports.values(),
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
