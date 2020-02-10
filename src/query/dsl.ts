import "reflect-metadata";
import {ColumnMetamodel, QueryTable, TableMetamodel} from "./metamodel";
import {Clone, DefaultMap} from "../lang";
import {UnsupportedOperationError} from "../errors";
import {
	AliasedExpressionNode,
	BooleanExpression,
	BooleanExpressionGroupNode,
	ColumnReferenceNode,
	ConstantNode,
	ExpressionListNode,
	GroupByExpressionNode,
	JoinNode,
	LiteralNode,
	NotExpressionNode,
	OrderByExpressionNode,
	ParameterOrValueExpressionNode,
	SelectCommandNode,
	SelectOutputExpression,
	SubSelectNode,
} from "./ast";
import {RectifyingWalker, SqlAstWalker} from "./walker";
import {QuerySelectorProcessor} from "./metadata";
import {QuerySelector, SelectorExpression, SelectorNestedMany, SelectorNestedOne} from "./querySelector";
import {execute, Queryable} from "../execution/execution";
import {MappedQuerySelector} from "./typeMapping";

export const enum SqlCommand {
	Select,
	Insert,
	Update,
	Delete
}

export interface GeneratedQuery {
	sql: string;
	parameters: any[];
}

export interface HasLimit {
	limit? : number;
	offset? : number;
}

class JoinBuilder<TResult> {
	protected joinType: 'inner' | 'left' | 'right' | 'full' | 'cross' = 'inner';
	protected onNode? : BooleanExpression;
	protected usingNodes? : ColumnReferenceNode[];

	constructor(
		protected tableMap: DefaultMap<string, string>,
		protected qtable: QueryTable,
		protected callback: (joinNode: JoinNode) => TResult) {
	}

	inner(): this {
		this.joinType = 'inner';
		return this;
	}

	left(): this {
		this.joinType = 'left';
		return this;
	}

	right(): this {
		this.joinType = 'right';
		return this;
	}

	full(): this {
		this.joinType = 'full';
		return this;
	}

	cross() {
		this.joinType = 'cross';
		return this.build();
	}

	on(expression: BooleanExpression) {
		this.onNode = expression;
		return this.build();
	}

	using(...columns: ColumnMetamodel<any>[]) {
		if (columns && columns.length > 0) {
			this.usingNodes = columns.map((column) => column.toColumnReferenceNode());
		}
		return this.build();
	}

	protected build(): TResult {
		if (this.onNode && this.usingNodes) {
			throw new UnsupportedOperationError(`Cannot join tables with both "on" and "using" criteria.`);
		} else if (this.joinType == 'cross' && (this.onNode || this.usingNodes)) {
			throw new UnsupportedOperationError(`Cannot make a cross join with "on" or "using" criteria.`);
		}
		const tableName = this.qtable.$table.name;
		const alias = this.tableMap.get(tableName);
		const joinNode: JoinNode = {
			type: 'joinNode',
			joinType: this.joinType,
			fromItem: {
				type: 'aliasedExpressionNode',
				alias,
				aliasPath: [alias],
				expression: {
					type: 'tableReferenceNode',
					tableName: tableName,
				}
			},
			on: this.onNode,
			using: this.usingNodes
		};
		return this.callback(joinNode);
	}
}

abstract class BaseQueryBuilder<TParams extends HasLimit> {
	protected tableMap = new DefaultMap<string, string>((key, map) => `t${ map.size + 1 }`);
	protected queryAst: SelectCommandNode = {
		type: 'selectCommandNode',
		distinction: 'all',
		outputExpressions: [],
		fromItems: [],
		joins: [],
		conditions: [],
		ordering: [],
		grouping: []
	};

	/**
	 * Adds referenced tables as "FROM" clauses for any tables not explicitly joined/from-ed.
	 */
	protected rectifyTableReferences() {
		const rectifier = new RectifyingWalker(this.queryAst, this.tableMap);
		rectifier.rectify();
	}

	@Clone()
	with(first: AliasedExpressionNode<SubSelectNode>, ...rest: AliasedExpressionNode<SubSelectNode>[]): this {
		this.queryAst.with = {
			type: "withNode",
			selectNodes: [first].concat(rest)
		};
		return this;
	}

	@Clone()
	distinct(): this {
		this.queryAst.distinction = 'distinct';
		return this;
	}

	@Clone()
	distinctOn(expression: ParameterOrValueExpressionNode): this {
		this.queryAst.distinction = 'on';
		this.queryAst.distinctOn = expression;
		return this;
	}

	@Clone()
	from(first: QueryTable, ...rest: QueryTable[]): this {
		for (const qtable of [first].concat(rest)) {
			const tableName = qtable.$table.name;
			const alias = qtable.$table.alias || this.tableMap.get(tableName);
			this.queryAst.fromItems.push({
				type: 'aliasedExpressionNode',
				alias,
				aliasPath: [alias],
				expression: {
					type: 'tableReferenceNode',
					tableName: tableName,
				}
			});
		}
		return this;
	}

	@Clone()
	join(queryTable: QueryTable): JoinBuilder<this> {
		return new JoinBuilder(this.tableMap, queryTable, (joinNode) => {
			this.queryAst.joins.push(joinNode);
			return this;
		});
	}

	@Clone()
	where(whereExpression: BooleanExpression): this {
		this.queryAst.conditions.push(whereExpression);
		return this;
	}

	@Clone()
	groupBy(first: GroupByExpressionNode, ...rest: GroupByExpressionNode[]): this {
		this.queryAst.grouping.push(first);
		if (rest && rest.length > 0) {
			rest.forEach((node) => this.queryAst.grouping.push(node));
		}
		return this;
	}

	@Clone()
	orderBy(first: OrderByExpressionNode, ...rest: OrderByExpressionNode[]): this {
		this.queryAst.ordering.push(first);
		if (rest && rest.length > 0) {
			rest.forEach((node) => this.queryAst.ordering.push(node));
		}
		return this;
	}

	@Clone()
	limit(limitNum? : number): this {
		this.queryAst.limit = {
			type: 'limitOffsetNode',
			limit: {
				type: 'constantNode',
				getter: limitNum !== undefined ? p => limitNum : p => p.limit
			},
			offset: {
				type: 'constantNode',
				getter: (params) => params.offset || 0
			}
		};
		return this;
	}
}

class QueryBuilder<TQuerySelector extends QuerySelector, TParams extends HasLimit> extends BaseQueryBuilder<TParams> {
	constructor(private command: SqlCommand, private querySelector: TQuerySelector) {
		super();
		this.select();
	}

	protected processQuerySelector(): Array<SelectOutputExpression> {
		const processor = new QuerySelectorProcessor(this.querySelector);
		return processor.process();
	}

	protected select(): this {
		this.queryAst = {
			type: 'selectCommandNode',
			distinction: 'all',
			outputExpressions: this.processQuerySelector(),
			fromItems: [],
			joins: [],
			conditions: [],
			ordering: [],
			grouping: []
		};
		return this;
	}

	prepare(): PreparedQuery<TQuerySelector, TParams> {
		const querySelector = this.querySelector;
		this.rectifyTableReferences();
		const walker = new SqlAstWalker(this.queryAst, this.tableMap);
		const data = walker.prepare();
		return new PreparedQuery<typeof querySelector, TParams>(querySelector, this.queryAst.outputExpressions, data.sql, data.parameterGetters);
	}

	toSql(params: TParams): GeneratedQuery {
		return this.prepare().generate(params);
	}

	execute(queryable: Queryable, params: TParams): Promise<MappedQuerySelector<TQuerySelector>[]> {
		return this.prepare().execute(queryable, params);
	}
}

class PreparedQuery<TQuerySelector extends QuerySelector, TParams> {
	constructor(
		protected readonly querySelector: TQuerySelector,
		protected readonly selectOutputExpressions: SelectOutputExpression[],
		protected readonly sql: string,
		protected readonly paramGetters: Array<(params: TParams) => any>) {

	}

	generate(params: TParams): GeneratedQuery {
		const values = this.paramGetters.map((getter) => getter(params));
		return {
			sql: this.sql,
			parameters: values
		};
	}

	execute(queryable: Queryable, params: TParams): Promise<MappedQuerySelector<TQuerySelector>[]> {
		return execute<TQuerySelector>(queryable, this.generate(params), this.querySelector, this.selectOutputExpressions);
	}
}

// TODO: how to reference expressions defined outside of this sub-query?
class SubQueryBuilder<TParams extends HasLimit> extends BaseQueryBuilder<TParams> {
	constructor(private command: SqlCommand, subSelectExpressions: SubSelectExpression[]) {
		super();
		this.select(subSelectExpressions);
	}

	protected processSubSelectExpressions(subSelectExpressions: SubSelectExpression[]) {
		for (let outputExpression of subSelectExpressions) {
			if (outputExpression instanceof ColumnMetamodel) {
				this.queryAst.outputExpressions.push(outputExpression.toColumnReferenceNode());
			} else {
				this.queryAst.outputExpressions.push(outputExpression);
			}
		}
	}

	protected select(subSelectExpressions: SubSelectExpression[]): this {
		this.queryAst = {
			type: 'selectCommandNode',
			distinction: 'all',
			outputExpressions: [],
			fromItems: [],
			joins: [],
			conditions: [],
			ordering: [],
			grouping: []
		};
		this.processSubSelectExpressions(subSelectExpressions);
		return this;
	}

	toSubQuery(): SubSelectNode {
		// TODO: merge the tableMaps so sub-queries can refer to outer tables.
		return {
			type: 'subSelectNode',
			query: this.queryAst
		};
	}
}

export function select<TQuerySelector extends QuerySelector, TParams>(querySelector: TQuerySelector): QueryBuilder<TQuerySelector, TParams> {
	return new QueryBuilder<TQuerySelector, TParams>(SqlCommand.Select, querySelector);
}

type SubSelectExpression = SelectOutputExpression | ColumnMetamodel<any>;

export function subSelect<TParams>(...outputExpressions: SubSelectExpression[]) {
	return new SubQueryBuilder<TParams>(SqlCommand.Select, outputExpressions);
}

export function and(first: BooleanExpression, second: BooleanExpression, ...rest: BooleanExpression[]): BooleanExpressionGroupNode {
	return {
		type: 'booleanExpressionGroupNode',
		operator: 'and',
		expressions: [first, second].concat(rest)
	};
}

export function or(first: BooleanExpression, second: BooleanExpression, ...rest: BooleanExpression[]): BooleanExpressionGroupNode {
	return {
		type: 'booleanExpressionGroupNode',
		operator: 'or',
		expressions: [first, second].concat(rest)
	};
}

export function not(expr: BooleanExpression): NotExpressionNode {
	return {
		type: 'notExpressionNode',
		expression: expr
	};
}

export function col(column: ColumnMetamodel<any>): ColumnReferenceNode {
	return column.toColumnReferenceNode();
}

export function constant(value: number | string): ConstantNode<number | string> {
	return {
		type: "constantNode",
		getter: () => value
	};
}

export function param<P, R>(getter: (params: P) => R): ConstantNode<R> {
	return {
		type: "constantNode",
		getter: getter
	};
}

export class ParamsWrapper<P> {
	get<R>(getter: (params: P) => R): ConstantNode<R> {
		return param(getter);
	}
}

export function literal(value: string): LiteralNode {
	return {
		type: "literalNode",
		value
	};
}
export function row(first: ParameterOrValueExpressionNode, ...rest: ParameterOrValueExpressionNode[]): ExpressionListNode {
	return {
		type: "expressionListNode",
		expressions: [first].concat(rest)
	};
}

export function selectExpression<T = never>(expression: ParameterOrValueExpressionNode): SelectorExpression<T> {
	return {
		$selectorKind: 'expression',
		expression
	} as SelectorExpression<T>;
}

export function selectNestedOne<T extends QuerySelector>(querySelector: T): SelectorNestedOne<T> {
	return {
		$selectorKind: 'nestedOne',
		nestedSelector: {
			querySelector
		}
	};
}

export function selectNestedMany<T extends QuerySelector>(querySelector: T): SelectorNestedMany<T> {
	return {
		$selectorKind: 'nestedMany',
		nestedSelector: {
			querySelector
		}
	};
}

export type CommonTableExpressionMetamodel<T extends QuerySelector> = {
	[K in keyof T]: ColumnMetamodel<any>;
};

export class CommonTableExpressionBuilder<TQuerySelector extends QuerySelector, TParams> extends BaseQueryBuilder<TParams> {
	constructor(
		protected readonly alias: string,
		protected readonly querySelector: TQuerySelector
	) {
		super();
		this.queryAst.outputExpressions = this.processQuerySelector();
	}

	protected processQuerySelector(): Array<SelectOutputExpression> {
		const processor = new QuerySelectorProcessor(this.querySelector);
		return processor.process();
	}

	toMetamodel(): CommonTableExpressionMetamodel<TQuerySelector> {
		this.rectifyTableReferences();
		const output: { [key: string]: ColumnMetamodel<any> } = {};
		const table = new TableMetamodel(this.alias, undefined);
		for (const expr of this.queryAst.outputExpressions) {
			switch (expr.type) {
				case "aliasedExpressionNode":
					output[expr.alias] = new ColumnMetamodel<any>(
						table,
						expr.alias,
					);
					break;
				default:
					throw new UnsupportedOperationError("Only aliased expressions can be used in CTEs");
			}
		}
		return output as CommonTableExpressionMetamodel<TQuerySelector>;
	}

	toNode(): AliasedExpressionNode<SubSelectNode> {
		this.rectifyTableReferences();
		return {
			type: "aliasedExpressionNode",
			alias: this.alias,
			aliasPath: [this.alias],
			expression: {
				type: 'subSelectNode',
				query: this.queryAst
			}
		};
	}
}

export function selectCte<TQuerySelector extends QuerySelector>(alias: string, querySelector: TQuerySelector) {
	return new CommonTableExpressionBuilder(alias, querySelector);
}
