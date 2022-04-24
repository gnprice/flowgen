import { compiler, beautify } from "..";
import "../test-matchers";

it("should handle `typeof`", () => {
  const ts = `
export const x: { o: { f(string): number } };
export type Tx = typeof x;
export type Txo = typeof x.o;
export type Txof = typeof x.o.f;

export namespace n { export const x: { y: number } }
export type N = typeof n;
export type Nx = typeof n.x;
export type Nxy = typeof n.x.y;

export namespace n { export namespace nn { export const x: number } }
export namespace n { export module mm { export const x: number } }

// These two should behave exactly the same -- a TS "module" declaration is
// just the old syntax for a TS "namespace", which were originally called
// "internal modules".
export type Nnn = typeof n.nn;
export type Nmm = typeof n.mm;

// Similarly these two.
export type Nnnx = typeof n.nn.x;
export type Nmmx = typeof n.mm.x;
`;
  const result = compiler.compileDefinitionString(ts);
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
