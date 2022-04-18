import * as ts from "typescript";
import { opts } from "../options";
import { checker } from "../checker";
import type Node from "../nodes/node";
import Namespace from "../nodes/namespace";
import * as printers from "./index";
import { withEnv } from "../env";

export const propertyDeclaration = (
  node: ts.VariableDeclaration | ts.PropertyDeclaration,
  keywordPrefix: string,
): string => {
  let left = keywordPrefix;
  const symbol = checker.current.getSymbolAtLocation(node.name);
  const name = ts.isVariableDeclaration(node)
    ? printers.node.getFullyQualifiedName(symbol, node.name)
    : printers.node.printType(node.name);
  if (
    node.modifiers &&
    node.modifiers.some(
      modifier => modifier.kind === ts.SyntaxKind.PrivateKeyword,
    )
  ) {
    return "";
  }
  if (
    node.modifiers &&
    node.modifiers.some(
      modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    )
  ) {
    left += "+";
  }

  left += name;

  if (node.type) {
    let right = printers.node.printType(node.type);
    if (ts.isPropertyDeclaration(node) && node.questionToken) {
      if (node.name.kind !== ts.SyntaxKind.ComputedPropertyName) {
        left += "?";
      } else {
        right = `(${right}) | void`;
      }
    }
    return left + ": " + right;
  }

  return left + `: ${printers.node.printType(node.initializer)}\n`;
};

export const variableDeclaration = (node: ts.VariableStatement): string => {
  const declarations = node.declarationList.declarations.map(
    printers.node.printType,
  );

  return declarations
    .map(name => `declare ${printers.relationships.exporter(node)}var ${name};`)
    .join("\n");
};

/**
 * The members of the type, printed with their jsdoc.
 */
export const typeMembers = (
  node: ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeLiteralNode,
): string[] => {
  const members: string[] = [];
  for (const member of node.members) {
    const printed = printers.node.printType(member);
    if (!printed) {
      // Filter rows which didn't print properly (private fields et al)
      continue;
    }
    members.push(printers.common.jsdoc(member) + printed);
  }
  return members;
};

/** Print as a Flow interface type's body (the `{…}` portion.) */
export const interfaceTypeBody = (node: ts.InterfaceDeclaration): string => {
  const members = typeMembers(node);
  if (members.length > 0) {
    members.push("\n");
  }

  const inner = members.join(",");

  return `{${inner}}`;
};

const classBody = <T>(
  node: ts.ClassDeclaration,
  nodeName: string,
  mergedNamespaceChildren: ReadonlyArray<Node<T>>,
): string => {
  const members = typeMembers(node);

  if (mergedNamespaceChildren.length > 0) {
    for (const child of Namespace.formatChildren(
      mergedNamespaceChildren,
      nodeName,
    )) {
      members.push(`static ${child}\n`);
    }
  }

  if (members.length > 0) {
    members.push("\n");
  }

  const inner = members.join(";");

  return `{${inner}}`;
};

const classHeritageClause = withEnv<
  { classHeritage?: boolean },
  [ts.ExpressionWithTypeArguments],
  string
>((env, type) => {
  let ret: string;
  env.classHeritage = true;
  // TODO: refactor this
  const symbol = checker.current.getSymbolAtLocation(type.expression);
  printers.node.fixDefaultTypeArguments(symbol, type);
  if (ts.isIdentifier(type.expression) && symbol) {
    ret =
      printers.node.getFullyQualifiedPropertyAccessExpression(
        symbol,
        type.expression,
      ) + printers.common.generics(type.typeArguments);
  } else {
    ret = printers.node.printType(type);
  }
  env.classHeritage = false;
  return ret;
});

const interfaceHeritageClause = (type: ts.ExpressionWithTypeArguments) => {
  // TODO: refactor this
  const symbol = checker.current.getSymbolAtLocation(type.expression);
  printers.node.fixDefaultTypeArguments(symbol, type);
  if (ts.isIdentifier(type.expression) && symbol) {
    const name = printers.node.getFullyQualifiedPropertyAccessExpression(
      symbol,
      type.expression,
    );
    return name + printers.common.generics(type.typeArguments);
  } else if (ts.isIdentifier(type.expression)) {
    const name = printers.identifiers.print(type.expression.text);
    if (typeof name === "function") {
      return name(type.typeArguments);
    } else {
      return name;
    }
  } else {
    return printers.node.printType(type);
  }
};

const interfaceRecordDeclaration = (
  nodeName: string,
  node: ts.InterfaceDeclaration,
  modifier: string,
): string => {
  let members: string[] = [];

  // If the class is extending something
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      for (const type of clause.types) {
        members.push(`...$Exact<${interfaceHeritageClause(type)}>`);
      }
    }
  }

  members = members.concat(typeMembers(node));

  const str = `${modifier}type ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} = ${printers.common.printObjectType(members)}\n`;

  return str;
};

export const interfaceDeclaration = (
  nodeName: string,
  node: ts.InterfaceDeclaration,
  modifier: string,
): string => {
  const isRecord = opts().interfaceRecords;
  if (isRecord) {
    return interfaceRecordDeclaration(nodeName, node, modifier);
  }

  if (node.heritageClauses) {
    // The interface is extending or implementing something.
    let heritage = node.heritageClauses
      .map(clause => {
        return clause.types.map(interfaceHeritageClause).join(" & ");
      })
      .join("");
    heritage = heritage.length > 0 ? `& ${heritage}\n` : "";

    return `${modifier}type ${nodeName}${printers.common.generics(
      node.typeParameters,
    )} = ${printers.common.printObjectType(
      typeMembers(node),
      true /* inexact so `&` works */,
    )} ${heritage}`;
  } else {
    return `${modifier}interface ${nodeName}${printers.common.generics(
      node.typeParameters,
    )} ${interfaceTypeBody(node)} `;
  }
};

export const typeDeclaration = (
  nodeName: string,
  node: ts.TypeAliasDeclaration,
  modifier: string,
): string => {
  const str = `${modifier}type ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} = ${printers.node.printType(node.type)};`;

  return str;
};

export const enumDeclaration = (
  nodeName: string,
  node: ts.EnumDeclaration,
): string => {
  const exporter = printers.relationships.exporter(node);
  const members: string[] = [];
  // @ts-expect-error iterating over an iterator
  for (const [index, member] of node.members.entries()) {
    let value: string;
    if (typeof member.initializer !== "undefined") {
      value = printers.node.printType(member.initializer);
    } else {
      value = index;
    }
    members.push(`+${member.name.text}: ${value}`);
  }
  return `
declare ${exporter} var ${nodeName}: ${printers.common.printObjectType(
    members,
    false,
  )};\n`;
};

export const typeReference = (
  node: ts.TypeReferenceNode,
  identifier: boolean,
): string => {
  if (ts.isQualifiedName(node.typeName)) {
    return (
      printers.node.printType(node.typeName) +
      printers.common.generics(node.typeArguments)
    );
  }
  let name = node.typeName.text;
  if (identifier) {
    const replaced = printers.identifiers.print(node.typeName.text);
    if (typeof replaced === "function") {
      return replaced(node.typeArguments);
    }
    name = replaced;
  }
  return (
    printers.relationships.namespaceProp(name) +
    printers.common.generics(node.typeArguments)
  );
};

export const classDeclaration = <T>(
  nodeName: string,
  node: ts.ClassDeclaration,
  mergedNamespaceChildren: ReadonlyArray<Node<T>>,
): string => {
  let heritage = "";

  // If the class is extending something
  if (node.heritageClauses) {
    heritage = node.heritageClauses
      .map(clause => {
        return clause.types.map(classHeritageClause).join(", ");
      })
      .join(", ");
    heritage = heritage.length > 0 ? `mixins ${heritage}` : "";
  }

  const str = `declare ${printers.relationships.exporter(
    node,
  )}class ${nodeName}${printers.common.generics(
    node.typeParameters,
  )} ${heritage} ${classBody(node, nodeName, mergedNamespaceChildren)}`;

  return str;
};
