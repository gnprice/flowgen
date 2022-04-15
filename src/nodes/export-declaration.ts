import type ts from "typescript";
import { ExportSpecifier, isNamespaceExport } from "typescript";
import * as printers from "../printers";
import Node from "./node";

export default class ExportDeclaration extends Node<ts.ExportDeclaration> {
  constructor(node: ts.ExportDeclaration) {
    super(node);
  }

  print(): string {
    //TODO: move to printers
    if (this.raw.exportClause) {
      const isTypeImport = this.raw.isTypeOnly;

      const specifier = this.raw.moduleSpecifier
        ? `from '${(this.raw.moduleSpecifier as ts.StringLiteral).text}';`
        : "";

      if (isNamespaceExport(this.raw.exportClause)) {
        return `declare export * as ${this.raw.exportClause.name.escapedText} ${specifier}\n`;
      }

      // split exports into type and value exports
      const rawElements = this.raw.exportClause.elements;
      let typeExports: ts.ExportSpecifier[] | ts.NodeArray<ExportSpecifier>;
      let valueExports: ts.ExportSpecifier[];
      if (isTypeImport) {
        typeExports = rawElements;
        valueExports = [];
      } else {
        typeExports = [];
        valueExports = [];
        let nextIsType = false;
        for (const node of rawElements) {
          if (nextIsType) {
            typeExports.push(node);
            nextIsType = false;
          } else if (node.name.originalKeywordKind === 150) {
            nextIsType = true;
          } else {
            valueExports.push(node);
          }
        }
      }

      const generateOutput = (
        prefix: string,
        elems: ReadonlyArray<ts.ExportSpecifier>,
      ) => {
        return `${prefix} {
          ${elems.map(node => printers.node.printType(node))}
        }${specifier}\n`;
      };

      let result = "";
      if (typeExports.length) {
        result += generateOutput(`export type`, typeExports);
      }
      if (valueExports.length) {
        result += generateOutput(`declare export`, valueExports);
      }
      return result;
    } else {
      const specifier = (this.raw.moduleSpecifier as ts.StringLiteral).text;
      return `declare export * from '${specifier}';\n`;
    }
  }
}
