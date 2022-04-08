import { compiler, beautify } from "..";
import "../test-matchers";

Error.stackTraceLimit = 20;

describe("should handle react types", () => {
  test("pure renames", () => {
    const ts = `
import type {ReactNode, ReactElement} from 'react'
import * as React from 'react'
declare function s(node: ReactNode): void;
declare function s(node: React.ReactNode): void;
declare function s(node: ReactElement<'div'>): void;
declare function s(node: React.ReactElement<'div'>): void;
`;
    const result = compiler.compileDefinitionString(ts, { quiet: true });
    expect(beautify(result)).toMatchSnapshot();
    expect(result).toBeValidFlowTypeDeclarations();
  });

  test("React.RefAttributes", () => {
    const ts = `
import type {ReactNode, RefAttributes as RA} from 'react'
import type {RefAttributes} from 'react'
import * as React from 'react'

class C {};
type A = React.RefAttributes<number>;
type AA = RA<number>;
type B = React.RefAttributes<C>;
type BB = RefAttributes<C>;
`;
    const result = compiler.compileDefinitionString(ts, { quiet: true });
    expect(beautify(result)).toMatchSnapshot();
    expect(result).toBeValidFlowTypeDeclarations();
  });
});

describe("should handle global types", () => {
  test("jsx", () => {
    const ts = `
import * as React from 'react'
declare function s(node: JSX.Element): void;

type Props = {children: JSX.Element}

declare class Component extends React.Component<Props> {
  render(): JSX.Element
}
`;
    const result = compiler.compileDefinitionString(ts, { quiet: true });
    expect(beautify(result)).toMatchSnapshot();
    expect(result).toBeValidFlowTypeDeclarations();
  });
});
