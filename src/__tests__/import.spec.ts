import { compiler, beautify } from "..";
import "../test-matchers";

it("should handle dynamic imports", () => {
  const ts = `
// type A = import('react'); // TODO hmm, why no typeof?
// type B = import('react').ComponentType<{}>; // TODO need to fix typeArguments in transformer
// type C = import('react').ReactNode; // TODO hmm, why no smart-identifier rewrite?
type D = import('zlib').Zlib;
type Z = number;
`;
  const result = compiler.compileDefinitionString(ts, { quiet: true });
  expect(beautify(result)).toMatchSnapshot();
  expect(result).toBeValidFlowTypeDeclarations();
});
