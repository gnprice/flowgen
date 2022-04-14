import Node from "./node";
import * as printers from "../printers";
import { checker } from "../checker";
import * as ts from "typescript";

export default class Import extends Node<ts.ImportDeclaration> {
  constructor(node: ts.ImportDeclaration) {
    super(node);
  }

  moduleSpecifier(): string {
    return (this.raw.moduleSpecifier as ts.StringLiteral).text;
  }

  print(): string {
    //TODO: move to printers
    if (this.raw.importClause) {
      const bindings = this.raw.importClause.namedBindings;
      const name = this.raw.importClause.name;
      const isTypeImport = this.raw.importClause.isTypeOnly;

      // in Typescript, you can use "import type" on an enum
      // however, flowgen converts typescript enums to regular objects
      // so that means "import type" would fail on them (can't import type a regular object)
      // instead, we mimic this by using the import { typeof } notation
      const splitTypeImports = elements => {
        const enumElems = [];
        const regularElems = [];
        for (const elem of elements) {
          // if we're not using import type, no need to do anything special
          if (!isTypeImport) {
            regularElems.push(elem);
            continue;
          }
          const elemSymbol = checker.current.getTypeAtLocation(elem).symbol;
          const isEnum =
            elemSymbol &&
            elemSymbol.declarations &&
            elemSymbol.declarations[0].kind === ts.SyntaxKind.EnumDeclaration;
          if (isEnum) {
            enumElems.push(elem);
          } else {
            regularElems.push(elem);
          }
        }
        return { enumElems, regularElems };
      };

      if (name && bindings) {
        if (ts.isNamedImports(bindings)) {
          const elements = bindings.elements;
          const { enumElems, regularElems } = splitTypeImports(elements);

          let result = "";
          if (regularElems.length > 0) {
            result += `import${
              this.module === "root" && !isTypeImport ? "" : " type"
            } ${name.text}, {
            ${elements.map(node => printers.node.printType(node))}
            } from '${this.moduleSpecifier()}';\n`;
          }
          if (enumElems.length > 0) {
            result += `import typeof ${name.text}, {
              ${elements.map(node => printers.node.printType(node))}
            } from '${this.moduleSpecifier()}';\n`;
          }

          return result;
        } else {
          const namespace = bindings.name.text;
          return `import${this.module === "root" ? "" : " typeof"} ${
            name.text
          }, * as ${namespace} from '${this.moduleSpecifier()}';\n`;
        }
      }
      if (name) {
        return `import${this.module === "root" ? "" : " typeof"} ${
          name.text
        } from '${this.moduleSpecifier()}';\n`;
      }
      if (bindings) {
        if (ts.isNamedImports(bindings)) {
          const elements = bindings.elements;
          const { enumElems, regularElems } = splitTypeImports(elements);

          let result = "";
          if (regularElems.length > 0) {
            result += `import${
              this.module === "root" && !isTypeImport ? "" : " type"
            } {
            ${regularElems.map(node => printers.node.printType(node))}
            } from '${this.moduleSpecifier()}';\n`;
          }
          if (enumElems.length > 0) {
            result += `import typeof {
              ${enumElems.map(node => printers.node.printType(node))}
            } from '${this.moduleSpecifier()}';\n`;
          }
          return result;
        } else {
          const name = bindings.name.text;
          return `import${
            this.module === "root" ? "" : " typeof"
          } * as ${name} from '${this.moduleSpecifier()}';\n`;
        }
      }
    }
    return this.module === "root"
      ? `import '${this.moduleSpecifier()}';\n`
      : "";
  }
}
