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
`;
  const result = compiler.compileDefinitionString(ts);
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
