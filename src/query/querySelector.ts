import {BooleanColumnMetamodel, DateColumnMetamodel, NumericColumnMetamodel, StringColumnMetamodel} from "./metamodel";
import {ParameterOrValueExpressionNode} from "./ast";

export type SelectorColumnTypes = (
	BooleanColumnMetamodel |
	DateColumnMetamodel |
	NumericColumnMetamodel |
	StringColumnMetamodel
);

export interface SelectorExpression<T> {
	readonly $selectorKind : 'expression';
	readonly expression : ParameterOrValueExpressionNode;
}

export interface NestedQueryOne {
	readonly querySelector : QuerySelector;
	readonly constructor : Function;
}

export interface NestedQueryMany {
	readonly querySelector : QuerySelector;
	readonly constructor : Function;
}

// export type NestedQuery = NestedQueryOne | NestedQueryMany;

export interface SelectorNestedOne {
	readonly $selectorKind : 'nestedOne';
	readonly nestedSelector : NestedQueryOne;
}

export interface SelectorNestedMany<T> {
	readonly $selectorKind : 'nestedMany';
	readonly nestedSelector : NestedQueryMany;
}

export type SelectorTypes = (
	SelectorColumnTypes
	| SelectorExpression<any>
	| SelectorNestedOne
	| SelectorNestedMany<any>
);

export type SelectorKind = 'column' | 'expression' | 'nestedOne' | 'nestedMany';

export interface QuerySelector {
	[key: string] : SelectorTypes;
}
