import * as ts from "typescript";
import { checker } from "../checker";

const setImportedName = (
  name: ts.__String,
  type: any,
  symbol: ts.Symbol,
  decl: ts.Declaration,
): boolean => {
  const specifiers = ["react"];
  const namespaces = ["React", "$Flowgen$Import$react"];
  const paths = (name: string) => {
    if (
      name === "react" ||
      name === "React" ||
      name === "$Flowgen$Import$react"
    ) {
      return {
        ReactNode: "Node",
        ReactElement: "Element",
      };
    }
    return {};
  };
  // @ts-expect-error todo(flow->ts)
  if (namespaces.includes(symbol.parent?.escapedName)) {
    // @ts-expect-error todo(flow->ts)
    type.escapedText = paths(symbol.parent?.escapedName)[name] || name;
    return true;
  } else if (
    // @ts-expect-error todo(flow->ts)
    specifiers.includes(decl.parent?.parent?.parent?.moduleSpecifier?.text)
  ) {
    type.escapedText =
      // @ts-expect-error todo(flow->ts)
      paths(decl.parent.parent.parent.moduleSpecifier.text)[name] || name;
    return true;
  }
  return false;
};

const setGlobalName = (type: any, _symbol): boolean => {
  const globals = [
    {
      from: ts.createQualifiedName(ts.createIdentifier("JSX"), "Element"),
      to: ts.createIdentifier("React$Node"),
    },
  ];
  if (checker.current) {
    const bools = [];
    for (const { from, to } of globals) {
      if (compareQualifiedName(type.typeName, from)) {
        type.typeName = to;
        bools.push(true);
      }
    }
    return bools.length > 0;
  }
  return false;
};

export function renames(symbol: ts.Symbol | void, type: any): boolean {
  // console.log({ symbol, type });
  if (!symbol) return false;
  if (!symbol.declarations) return false;
  // todo(flow->ts)
  const decl: any = symbol.declarations[0];
  if (type.parent && ts.isNamedImports(type.parent)) {
    setImportedName(decl.name.escapedText, decl.name, symbol, decl);
  } else if (type.kind === ts.SyntaxKind.TypeReference) {
    const leftMost = getLeftMostEntityName(type.typeName);
    if (leftMost && checker.current) {
      const leftMostSymbol = checker.current.getSymbolAtLocation(leftMost);
      const isGlobal = leftMostSymbol?.parent?.escapedName === "__global";
      if (isGlobal) {
        return setGlobalName(type, symbol);
      }
    }
    if (type.typeName.right) {
      return setImportedName(
        symbol.escapedName,
        type.typeName.right,
        symbol,
        decl,
      );
    } else {
      return setImportedName(symbol.escapedName, type.typeName, symbol, decl);
    }
  }
  return false;
}

export function rewriteReference(
  node: ts.TypeReferenceNode,
  type: ts.Type,
): ts.Node {
  if (!type) return node;
  const parentDecl = type.symbol?.parent?.declarations[0];
  if (!parentDecl) return node;
  // console.log(
  //   type.id,
  //   type.symbol.escapedName,
  //   type.symbol.id,
  //   type.symbol.parent?.escapedName,
  //   // type.symbol.parent.declarations[0],
  //   ts.SyntaxKind[type.symbol.parent?.declarations[0]?.kind],
  // );
  if (ts.isModuleDeclaration(parentDecl)) {
    const parentName = parentDecl.name.text;

    // Rewrite React.RefAttributes, expanding its definition.
    // TODO: Perhaps also delete any imports of it; that'd be a nice touch.
    if (
      parentName === "React" &&
      type.symbol.name === "RefAttributes" &&
      node.typeArguments.length === 1
    ) {
      return ts.createTypeLiteralNode([
        ts.createPropertySignature(
          [ts.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
          "ref",
          undefined,
          node.typeArguments[0],
        ),
      ]);
    }
  }
  return node;
}

export function getLeftMostEntityName(type: ts.EntityName) {
  if (type.kind === ts.SyntaxKind.QualifiedName) {
    return type.left.kind === ts.SyntaxKind.Identifier
      ? type.left
      : getLeftMostEntityName(type.left);
  } else if (type.kind === ts.SyntaxKind.Identifier) {
    return type;
  }
}

function compareIdentifier(a: ts.Identifier, b: ts.Identifier): boolean {
  if (a.kind !== b.kind) return false;
  if (a.escapedText === b.escapedText && a.text === b.text) return true;
  return false;
}

function compareEntityName(a: ts.EntityName, b: ts.EntityName): boolean {
  if (
    a.kind === ts.SyntaxKind.Identifier &&
    b.kind === ts.SyntaxKind.Identifier
  ) {
    return compareIdentifier(a, b);
  }
  if (
    a.kind === ts.SyntaxKind.QualifiedName &&
    b.kind === ts.SyntaxKind.QualifiedName
  ) {
    return compareQualifiedName(a, b);
  }
  return false;
}

function compareQualifiedName(
  a: ts.QualifiedName,
  b: ts.QualifiedName,
): boolean {
  if (a.kind !== b.kind) return false;
  return (
    compareEntityName(a.left, b.left) && compareIdentifier(a.right, b.right)
  );
}
