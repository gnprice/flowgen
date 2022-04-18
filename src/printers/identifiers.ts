// Please add only built-in type references

import * as printers from "./index";
import { opts } from "../options";
import { withEnv } from "../env";
import ts from "typescript";

const Record = ([key, value]: [any, any], inexact?: boolean) => {
  const valueType = printers.node.printType(value);

  switch (key.kind) {
    case ts.SyntaxKind.LiteralType:
      return printers.common.printObjectType(
        [`${printers.node.printType(key)}: ${valueType}`],
        inexact,
      );
    case ts.SyntaxKind.UnionType:
      if (key.types.every(t => t.kind === ts.SyntaxKind.LiteralType)) {
        const fields = key.types.map(
          t => `${printers.node.printType(t)}: ${valueType}`,
        );
        return printers.common.printObjectType(fields, inexact);
      }
    // Fallthrough
    default:
      return printers.common.printObjectType(
        [`[key: ${printers.node.printType(key)}]: ${valueType}`],
        inexact,
      );
  }
};

type IdentifierResult = string | ((...args: any[]) => any);

const identifiers: { [name: string]: IdentifierResult } = {
  ReadonlyArray: "$ReadOnlyArray",
  ReadonlySet: "$ReadOnlySet",
  ReadonlyMap: "$ReadOnlyMap",
  Readonly: "$ReadOnly",
  RegExpMatchArray: "RegExp$matchResult",
  NonNullable: "$NonMaybeType",
  Partial: ([type]: any[]) => {
    const isInexact = opts().inexact;
    return `$Rest<${printers.node.printType(type)}, {${
      isInexact ? "..." : ""
    }}>`;
  },
  ReturnType: (typeArguments: any[]) => {
    return `$Call<<R>((...args: any[]) => R) => R, ${printers.node.printType(
      typeArguments[0],
    )}>`;
  },
  Record,
  Omit: ([obj, keys]: [any, any]) => {
    return `$Diff<${printers.node.printType(obj)},${Record(
      [keys, { kind: ts.SyntaxKind.AnyKeyword }],
      false,
    )}>`;
  },
};

export const print = withEnv<any, [string], IdentifierResult>((env, kind) => {
  if (env.classHeritage) return kind;
  return Object.prototype.hasOwnProperty.call(identifiers, kind)
    ? identifiers[kind]
    : kind;
});
