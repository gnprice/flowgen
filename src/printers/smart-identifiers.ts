import * as ts from "typescript";
import { checker } from "../checker";

const setImportedName = (
  name: ts.__String,
  type: any,
  symbol: ts.Symbol,
  decl: ts.Declaration,
): boolean => {
  const specifiers = ["react"];
  const namespaces = ["React"];
  const paths = (name: string) => {
    if (name === "react" || name === "React") {
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

/**
 * Rewrite a node just before printing, when necessary.
 *
 * This handles things like names that exist in the React TS type
 * definitions but have no counterpart in the React Flow type definitions.
 * (For simpler cases where just the name has to change, `renames` does the
 * job.)
 *
 * This can return:
 *  * The same node it's passed, in which case we go ahead and print it.
 *  * A different node, in which case we recursively print that instead.
 *  * `null`, in which case we print nothing instead.
 */
export function rewriteNode(node: ts.Node, checker: ts.TypeChecker): ts.Node {
  if (ts.isTypeReferenceNode(node)) {
    const type = checker.getTypeAtLocation(node.typeName);
    if (!type) return node;
    const parentDecl = type.symbol?.parent?.declarations[0];
    if (!parentDecl) return node;
    if (ts.isModuleDeclaration(parentDecl)) {
      const parentName = parentDecl.name.text;

      // Rewrite ReactNative.Constructor, expanding its definition.
      if (
        parentName === "ReactNative" &&
        type.symbol.name === "Constructor" &&
        node.typeArguments.length === 1
      ) {
        // TS version in @types/react-native:
        //   type Constructor<T> = new (...args: any[]) => T;
        // Rewrite as Flow:
        //   type Constructor<T: interface {}> =
        //     Class<T & interface { constructor(...args: any[]): void }>;
        // TODO:
        //   * Handle those "new" function types, if we don't already,
        //     using the Class<… & interface { constructor(…): void }> idea.
        //   * Handle this by just rewriting to one of those.
        return node; // TODO WORK HERE
      }
    }
    return node;
  } else if (ts.isImportSpecifier(node)) {
    const name = (node.propertyName ?? node.name).text;
    const source = (
      node.parent.parent.parent.moduleSpecifier as ts.StringLiteral
    ).text;

    // Delete imports of ReactNative.Constructor.  (Above, we rewrite away
    // any uses of it.)
    if (source === "react-native" && name === "Constructor") {
      return null;
    }
    return node;
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
