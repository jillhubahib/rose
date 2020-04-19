import {
	BooleanBinaryOperationNode,
	BooleanUnaryOperationNode,
	ColumnReferenceNode,
	ConstantNode,
	OrderByExpressionNode,
	ParameterOrValueExpressionNode,
	ValueExpressionNode
} from "./ast";
import { any } from "./postgresql/functions/array/functions";
import { OptionalNulls } from "../lang";

export class TableMetamodel {

	constructor(
		readonly name: string,
		readonly alias: string | undefined // Not great having this here, since it conflates metamodel with stateful querying.
	) {
	}
}

export type ParamGetter<P, R> = (params: P) => R;

function isParamGetter<R>(value: any): value is ParamGetter<any, R> {
	return value && typeof value == 'function';
}

export interface ColumnMetamodelOptions<R> {
	references: R;
}

type BooleanUnaryOperators = 'IS NULL'
	| 'IS NOT NULL'
	| 'IS TRUE'
	| 'IS NOT TRUE'
	| 'IS FALSE'
	| 'IS NOT FALSE'
	| 'IS UNKNOWN'
	| 'IS NOT UNKNOWN';
type BooleanBinaryOperators = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'IS DISTINCT FROM' | 'IS NOT DISTINCT FROM' | 'IN';
type ValueType<T> = ((params: unknown) => T) | ColumnMetamodel<T> | ParameterOrValueExpressionNode;

export class ColumnMetamodel<T> {
	public readonly $selectorKind: 'column' = 'column';
	protected readonly $resultType!: T; // type-only value

	constructor(
		readonly table: TableMetamodel,
		readonly name: string,
		private options? : ColumnMetamodelOptions<any>
	) {

	}

	asc(): OrderByExpressionNode {
		return {
			type: "orderByExpressionNode",
			expression: this.toColumnReferenceNode(),
			order: "asc"
		};
	}

	desc(): OrderByExpressionNode {
		return {
			type: "orderByExpressionNode",
			expression: this.toColumnReferenceNode(),
			order: "desc"
		};
	}

	protected coerceToNode<T>(value: ValueType<T>): ParameterOrValueExpressionNode {
		if (value instanceof ColumnMetamodel) {
			return value.toColumnReferenceNode();
		} else if (isParamGetter(value)) {
			return <ConstantNode<T>> {
				type: 'constantNode',
				getter: value
			};
		} else {
			return value;
		}
	}

	protected createBooleanBinaryOperationNode(
		operator: BooleanBinaryOperators,
		value: ValueType<T>): BooleanBinaryOperationNode {
		let right: ParameterOrValueExpressionNode = this.coerceToNode(value);
		return {
			type: 'binaryOperationNode',
			left: this.toColumnReferenceNode(),
			right,
			operator
		};
	}

	eq(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('=', value);
	}

	neq(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('!=', value);
	}

	gt(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('>', value);
	}

	gte(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('>=', value);
	}

	lt(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('<', value);
	}

	lte(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('<=', value);
	}

	isDistinctFrom(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IS DISTINCT FROM', value);
	}

	isNotDistinctFrom(value: ValueType<T>): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IS NOT DISTINCT FROM', value);
	}

	/**
	 * "in" cannot accept a parameter, since the row literal can only substitute each value in the row, and not the
	 * entire row.
	 * Instead, use "eqAny", which allows you to substitute an entire array value.
	 */
	in(value: ValueExpressionNode): BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IN', value);
	}

	eqAny(value: ValueType<T | T[]>): BooleanBinaryOperationNode {
		return this.eq(any(this.coerceToNode(value)));
	}

	protected createBooleanUnaryOperationNode(operator: BooleanUnaryOperators): BooleanUnaryOperationNode {
		return {
			type: 'unaryOperationNode',
			expression: this.toColumnReferenceNode(),
			operator,
			position: 'right' // TODO: support left-hand unary operators
		};
	}

	isNull(): BooleanUnaryOperationNode {
		return this.createBooleanUnaryOperationNode('IS NULL');
	}

	isNotNull() {
		return this.createBooleanUnaryOperationNode('IS NOT NULL');
	}

	isTrue() {
		return this.createBooleanUnaryOperationNode('IS TRUE');
	}

	isNotTrue() {
		return this.createBooleanUnaryOperationNode('IS NOT TRUE');
	}

	isFalse() {
		return this.createBooleanUnaryOperationNode('IS FALSE');
	}

	isNotFalse() {
		return this.createBooleanUnaryOperationNode('IS NOT FALSE');
	}

	isUnknown() {
		return this.createBooleanUnaryOperationNode('IS UNKNOWN');
	}

	isNotUnknown() {
		return this.createBooleanUnaryOperationNode('IS NOT UNKNOWN');
	}

	toColumnReferenceNode(): ColumnReferenceNode {
		return {
			type: 'columnReferenceNode',
			columnName: this.name,
			tableName: this.table.name,
			tableAlias: this.table.alias || undefined
		};
	}
}

export abstract class QueryTable {
	protected constructor(
		readonly $table: TableMetamodel,
		readonly $tableAlias? : string
	) {
		// TODO: validate that $tableAlias does not match the pattern of automatically generated aliases, e.g. "t1".
	}
}

export type TableColumns<T extends QueryTable> = {
	[K in Exclude<keyof T, '$table' | '$tableAlias'>]: T[K] extends ColumnMetamodel<infer U> ? U : never;
}

export type PartialTableColumns<T extends QueryTable> = Partial<TableColumns<T>>;

export type AstMap<T> = {
	[K in keyof T]: ParameterOrValueExpressionNode;
};

export type TableColumnsForUpdateCommand<T extends QueryTable> = AstMap<TableColumns<T>>;

export type TableColumnsForInsertCommand<T extends QueryTable> = AstMap<OptionalNulls<TableColumns<T>>>;

export type TableColumnsForInsertCommandFromRow<T> = AstMap<OptionalNulls<T>>;