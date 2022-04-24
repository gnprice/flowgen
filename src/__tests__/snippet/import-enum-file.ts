import { Label as ImportedLabel, LabelA, LLabel } from "./export-enum-file";

export function foo(label: ImportedLabel): void {
  console.log(label);
}

export type X = LabelA;
export type Y = LLabel;
