import "reflect-metadata";
import {InvalidTableDefinitionError, InvalidColumnDefinitionError} from "../errors";
import {getMetadata} from "../lang";
import {
	ColumnReferenceNode, ConstantNode, OrderByExpressionNode,
	BooleanBinaryOperationNode, BooleanUnaryOperationNode, SubSelectNode
} from "./ast";

export const METADATA_KEY_PREFIX = "arbaon.";
export const TABLE_METADATA_KEY = `${ METADATA_KEY_PREFIX }table`;
export function Table<T>(metamodel : TableMetamodel) : ClassDecorator {
	return function (target : Function) {
		if (Reflect.hasMetadata(TABLE_METADATA_KEY, target)) {
			throw new InvalidTableDefinitionError(`Class "${ target.name }" already has table metadata defined.`);
		} else {
			Reflect.defineMetadata(TABLE_METADATA_KEY, metamodel, target.prototype);
		}
	}
}

export const SELECT_METADATA_KEY = `${ METADATA_KEY_PREFIX }select`;
export function Column<T>(metamodel : ColumnMetamodel<any>) : PropertyDecorator {
	return function (target : Object, propertyKey : string | symbol) {
		let metadata = getMetadata<Map<string, ColumnMetamodel<any>>>(SELECT_METADATA_KEY, target);
		if (!metadata) {
			metadata = new Map<string, ColumnMetamodel<any>>();
			Reflect.defineMetadata(SELECT_METADATA_KEY, metadata, target);
		} else if (metadata.get(<string> propertyKey) !== undefined) {
			throw new InvalidColumnDefinitionError(`Property "${ propertyKey }" already has column metadata defined.`);
		}
		metadata.set(<string> propertyKey, metamodel);
	}
}

export class TableMetamodel {

	constructor(
		readonly name : string,
		readonly alias : string | undefined // Not great having this here, since it conflates metamodel with stateful querying.
	) {
	}
}

function isSubSelectNode(node : { type? : string }) : node is SubSelectNode {
	return node && node.type == 'subSelectNode';
}

export interface ColumnMetamodelOptions<R> {
	references : R;
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
type ValueType<T> = ((params : any) => T) | ColumnMetamodel<T> | SubSelectNode;

export abstract class ColumnMetamodel<T> {
	constructor(
		readonly table : TableMetamodel,
		readonly name : string,
		readonly type : Function,
		private options? : ColumnMetamodelOptions<any>
	) {

	}

	asc() : OrderByExpressionNode {
		return {
			type: "orderByExpressionNode",
			expression: this.toColumnReferenceNode(),
			order: "asc"
		};
	}

	desc() : OrderByExpressionNode {
		return {
			type: "orderByExpressionNode",
			expression: this.toColumnReferenceNode(),
			order: "desc"
		};
	}

	protected createBooleanBinaryOperationNode(
		operator : BooleanBinaryOperators,
		value : ValueType<T>) : BooleanBinaryOperationNode {
		let right : ColumnReferenceNode | ConstantNode<T> | SubSelectNode;
		if (value instanceof ColumnMetamodel) {
			right = value.toColumnReferenceNode();
		} else if (isSubSelectNode(value)) {
			right = value;
		} else {
			right = <ConstantNode<T>> {
				type: 'constantNode',
				getter: value
			};
		}
		return {
			type: 'binaryOperationNode',
			left: this.toColumnReferenceNode(),
			right,
			operator
		};
	}

	eq(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('=', value);
	}

	neq(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('!=', value);
	}

	gt(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('>', value);
	}

	gte(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('>=', value);
	}

	lt(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('<', value);
	}

	lte(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('<=', value);
	}

	isDistinctFrom(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IS DISTINCT FROM', value);
	}

	isNotDistinctFrom(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IS NOT DISTINCT FROM', value);
	}

	in(value : ValueType<T>) : BooleanBinaryOperationNode {
		return this.createBooleanBinaryOperationNode('IN', value);
	}

	protected createBooleanUnaryOperationNode(operator : BooleanUnaryOperators) : BooleanUnaryOperationNode {
		return {
			type: 'unaryOperationNode',
			expression: this.toColumnReferenceNode(),
			operator,
			position: 'right' // TODO: support left-hand unary operators
		};
	}

	isNull() : BooleanUnaryOperationNode {
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

	toColumnReferenceNode() : ColumnReferenceNode {
		return {
			type: 'columnReferenceNode',
			columnName: this.name,
			tableName: this.table.name,
			tableAlias: this.table.alias || undefined
		};
	}
}

export class NumericColumnMetamodel extends ColumnMetamodel<number> {

}

export class StringColumnMetamodel extends ColumnMetamodel<string> {

}

export class BooleanColumnMetamodel extends ColumnMetamodel<boolean> {

}

export class DateColumnMetamodel extends ColumnMetamodel<Date> {

}

export abstract class QueryTable {
	$table : TableMetamodel;

	constructor(
		readonly $tableAlias? : string
	) {
		// TODO: validate that $tableAlias does not match the pattern of automatically generated aliases, e.g. "t1".
	}
}

export function getTableNameFromColumn(columnMetamodel : ColumnMetamodel<any>) : string {
	return columnMetamodel.table.name;
}
