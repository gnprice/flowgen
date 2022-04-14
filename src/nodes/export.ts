import ts from "typescript";
import Node from "./node";

import * as printers from "../printers";

export default class Export extends Node<ts.ExportAssignment> {
  constructor(node: ts.ExportAssignment) {
    super(node);
  }

  print() {
    return printers.relationships.moduleExports(this.raw);
  }
}
