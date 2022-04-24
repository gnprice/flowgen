import type { TypeChecker } from "typescript";

export const checker: {
  current: TypeChecker;
} = { current: null };
