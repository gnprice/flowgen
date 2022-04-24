import { Label as ImportedLabel, LabelA, LLabel } from "./export-enum-file";
import {
  Label as ImportedLabelR,
  LabelA as LabelAR,
  LLabel as LLabelR,
} from "./reexport-enum-file";

export function foo(label: ImportedLabel): void {
  console.log(label);
}

export type WM = ImportedLabel.A;
export type X = LabelA;
export type Y = LLabel;

export type WR = ImportedLabelR;
export type WRM = ImportedLabelR.A;
export type XR = LabelAR;
export type YR = LLabelR;
