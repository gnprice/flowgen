// Please add only built-in type references

import * as printers from "./index";
import { opts } from "../options";
import { withEnv } from "../env";
import ts from "typescript";

const printRecord = (
  [key, value]: [ts.TypeNode, ts.TypeNode],
  isInexact: boolean,
) => {
  const valueType = printers.node.printType(value);

  switch (key.kind) {
    case ts.SyntaxKind.LiteralType:
      return `{ ${printers.node.printType(key)}: ${valueType}${
        isInexact ? ", ..." : ""
      }}`;
    case ts.SyntaxKind.UnionType: {
      const types = (key as ts.UnionTypeNode).types;
      if (types.every(t => t.kind === ts.SyntaxKind.LiteralType)) {
        const fields = types.reduce((acc, t) => {
          acc += `${printers.node.printType(t)}: ${valueType},\n`;
          return acc;
        }, "");
        return `{ ${fields}${isInexact ? "..." : ""}}`;
      }
    }
    // Fallthrough
    default:
      return `{[key: ${printers.node.printType(key)}]: ${valueType}${
        isInexact ? ", ..." : ""
      }}`;
  }
};

type IdentifierResult =
  | string
  | ((typeArguments: ts.NodeArray<ts.TypeNode>) => string);

const identifiers: { [name: string]: IdentifierResult } = {
  ReadonlyArray: "$ReadOnlyArray",
  ReadonlySet: "$ReadOnlySet",
  ReadonlyMap: "$ReadOnlyMap",
  Readonly: "$ReadOnly",
  RegExpMatchArray: "RegExp$matchResult",
  NonNullable: "$NonMaybeType",
  Partial: ([type]) => {
    const isInexact = opts().inexact;
    return `$Rest<${printers.node.printType(type)}, {${
      isInexact ? "..." : ""
    }}>`;
  },
  ReturnType: typeArguments => {
    return `$Call<<R>((...args: any[]) => R) => R, ${printers.node.printType(
      typeArguments[0],
    )}>`;
  },
  Record: ([key, value]) => printRecord([key, value], opts().inexact),
  Omit: ([obj, keys]) => {
    return `$Diff<${printers.node.printType(obj)},${printRecord(
      [keys, ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)],
      false,
    )}>`;
  },
};

export const print = withEnv(
  (env: { classHeritage?: boolean }, kind: string): IdentifierResult => {
    if (env.classHeritage) return kind;
    return Object.prototype.hasOwnProperty.call(identifiers, kind)
      ? identifiers[kind]
      : kind;
  },
);
