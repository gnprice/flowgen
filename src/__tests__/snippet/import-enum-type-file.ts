import type {
  Label as ImportedLabel,
  LabelA,
  LLabel, // TODO BROKEN: gets `import typeof`
} from "./export-enum-file";
import type {
  Label as ImportedLabelR,
  LabelA as LabelAR,
  LLabel as LLabelR, // TODO BROKEN: gets `import typeof`
} from "./reexport-enum-file";

// Plus the same brokenness as in import-enum-file.ts from e.g. renaming on import.

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
