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

  test("rewrite away React.RefAttributes", () => {
    const ts = `
// Works correctly even if React or RefAttributes is renamed at import.
// Deletes any RefAttributes import, to prevent a Flow error there.
import type {ReactNode, RefAttributes as RA} from 'react'
import type {RefAttributes} from 'react'
import * as React from 'react'
import * as RenamedAct from 'react'

type A = React.RefAttributes<number>;
type B = RA<number>;
type C = RenamedAct.RefAttributes<number>;
`;
    const result = compiler.compileDefinitionString(ts, { quiet: true });
    expect(beautify(result)).toMatchSnapshot();
    expect(result).toBeValidFlowTypeDeclarations();
  });

  test("apply typeof to component types", () => {
    const ts = `
import * as React from 'react'

// Simplified from the View definition in the react-native TS definitions.
declare type ViewProps = { style?: string };
declare class ViewComponent extends React.Component<ViewProps> {}
declare const ViewBase: /* Constructor<NativeMethods> & */ typeof ViewComponent;
class View extends ViewBase {}

// This translates literally (no typeof added), and that works fine.
// View is a class, so it's perfectly acceptable as a type.
type A = View;

// But then in the actual react-native source, the definition is:
//   const View: React.AbstractComponent<
//     ViewProps,
//     React.ElementRef<typeof ViewNativeComponent>,
//   > = React.forwardRef((props: ViewProps, forwardedRef) => {
//     // …
//
// Now View is a value that may not be a class -- in fact, that isn't.
// So it isn't acceptable as a type, but 'typeof View' is.
//
// Here's a simulation of that in TS:
const View2: React.ComponentType<ViewProps> = View;

// With that TS definition -- the one that resembles the real View
// definition much better than the react-native TS definitions do --
// this line is an error already in TS:
type B = View2;
`;
    // TODO: Do something like: if a type extends React.ComponentType

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
