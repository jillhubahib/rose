import { RectifyingWalker } from "../../src/query/walker";
import { AliasedFromExpressionNode, FromItemNode, SelectCommandNode, SubSelectNode } from "../../src/query/ast";
import { DefaultMap } from "../../src/lang";
import { deepEqual, equal, fail } from "assert";

function getFromItem(fromItem: FromItemNode): AliasedFromExpressionNode | never {
	if (fromItem.type == "aliasedExpressionNode") {
		return fromItem;
	} else {
		throw fail(fromItem, "AliasedFromExpressionNode", "Expected an AliasedFromExpressionNode", "!=");
	}
}

describe("AST Walkers", function () {
	describe("Rectifying Walker", function () {
		it("Rectifies a table referenced in a column reference node", function () {
			const ast: SelectCommandNode = {
				type: 'selectCommandNode',
				outputExpressions: [
					{
						type: "columnReferenceNode",
						tableName: "Users",
						columnName: "id"
					}
				],
				distinction: 'all',
				fromItems: [],
				joins: [],
				conditions: [],
				ordering: [],
				grouping: []
			};
			const tableMap = new DefaultMap<string, string>((key, map) => `t${ map.size + 1 }`);
			const walker = new RectifyingWalker(ast, tableMap);
			walker.rectify();
			equal(ast.fromItems.length, 1);
			const fromItem = getFromItem(ast.fromItems[0]);
			equal(fromItem.expression.tableName, "Users");
			equal(fromItem.alias, "t1");
		});

		it("Does not rectify a table referenced in a column reference node and in a from item node", function () {
			const ast: SelectCommandNode = {
				type: 'selectCommandNode',
				outputExpressions: [
					{
						type: "columnReferenceNode",
						tableName: "Users",
						columnName: "id"
					}
				],
				distinction: 'all',
				fromItems: [
					{
						type: "aliasedExpressionNode",
						alias: "t1",
						aliasPath: ["t1"],
						expression: {
							type: "tableReferenceNode",
							tableName: "Users"
						}
					}
				],
				joins: [],
				conditions: [],
				ordering: [],
				grouping: []
			};
			const tableMap = new DefaultMap<string, string>((key, map) => `t${ map.size + 1 }`);
			const walker = new RectifyingWalker(ast, tableMap);
			walker.rectify();
			equal(ast.fromItems.length, 1);
			const fromItem = getFromItem(ast.fromItems[0]);
			equal(fromItem.expression.tableName, "Users");
			equal(fromItem.alias, "t1");
			equal(fromItem.expression.tableName, "Users");
			equal(fromItem.alias, "t1");
		});

		it("Rectifies nested sub-queries individually, separate from the outer query", function () {
			const subSelectNode: SubSelectNode = {
				type: 'subSelectNode',
				query: {
					type: 'selectCommandNode',
					outputExpressions: [
						{
							type: "columnReferenceNode",
							tableName: "Locations",
							columnName: "id"
						}
					],
					distinction: 'all',
					fromItems: [],
					joins: [],
					conditions: [
						{
							type: 'binaryOperationNode',
							left: {
								type: "columnReferenceNode",
								tableName: "Locations",
								columnName: "id"
							},
							operator: '=',
							right: {
								type: 'constantNode',
								getter: (p: { locationId: number }) => p.locationId
							}
						}
					],
					ordering: [],
					grouping: []
				}
			};

			const ast: SelectCommandNode = {
				type: 'selectCommandNode',
				outputExpressions: [
					{
						type: "columnReferenceNode",
						tableName: "Users",
						columnName: "id"
					}
				],
				distinction: 'all',
				fromItems: [],
				joins: [],
				conditions: [
					{
						type: 'binaryOperationNode',
						left: {
							type: "columnReferenceNode",
							tableName: "Users",
							columnName: "locationId"
						},
						operator: '=',
						right: subSelectNode
					}
				],
				ordering: [],
				grouping: []
			};
			const tableMap = new DefaultMap<string, string>((key, map) => `t${ map.size + 1 }`);
			const walker = new RectifyingWalker(ast, tableMap);
			walker.rectify();
			equal(ast.fromItems.length, 1);
			const fromItem = getFromItem(ast.fromItems[0]);
			equal(fromItem.expression.tableName, "Users");
			equal(fromItem.alias, "t2");
			equal(ast.conditions.length, 1);
			equal(subSelectNode.query.fromItems.length, 1);
			const nestedFromItem = getFromItem(subSelectNode.query.fromItems[0]);
			equal(nestedFromItem.expression.tableName, "Locations");
			equal(nestedFromItem.alias, "t1");
		});

		it("Rectifies unaliased FROM locations", function () {

			const ast: SelectCommandNode = {
				"type": "selectCommandNode",
				"distinction": "all",
				"outputExpressions": [
					{
						"type": "aliasedExpressionNode",
						"alias": "region",
						"aliasPath": [
							"region"
						],
						"expression": {
							"type": "columnReferenceNode",
							"columnName": "region",
							"tableName": "orders",
							"tableAlias": undefined
						}
					},
					{
						"type": "aliasedExpressionNode",
						"alias": "total_sales",
						"aliasPath": [
							"total_sales"
						],
						"expression": {
							"type": "functionExpressionNode",
							"name": "sum",
							"arguments": [
								{
									"type": "columnReferenceNode",
									"columnName": "amount",
									"tableName": "orders",
									"tableAlias": undefined
								}
							]
						}
					}
				],
				"fromItems": [
					{
						"type": "aliasedExpressionNode",
						"alias": "t1",
						"aliasPath": [
							"t1"
						],
						"expression": {
							"type": "tableReferenceNode",
							"tableName": "orders"
						}
					}
				],
				"joins": [],
				"conditions": [],
				"ordering": [],
				"grouping": [
					{
						"type": "groupByExpressionNode",
						"expression": {
							"type": "columnReferenceNode",
							"columnName": "region",
							"tableName": "orders",
							"tableAlias": undefined
						}
					}
				]
			};
			const tableMap = new DefaultMap<string, string>((key, map) => `t${ map.size + 1 }`);
			const walker = new RectifyingWalker(ast, tableMap);
			walker.rectify();

			const expected = {
				"type": "selectCommandNode",
				"distinction": "all",
				"outputExpressions": [
					{
						"type": "aliasedExpressionNode",
						"alias": "region",
						"aliasPath": [
							"region"
						],
						"expression": {
							"type": "columnReferenceNode",
							"columnName": "region",
							"tableName": "orders",
							"tableAlias": "t1"
						}
					},
					{
						"type": "aliasedExpressionNode",
						"alias": "total_sales",
						"aliasPath": [
							"total_sales"
						],
						"expression": {
							"type": "functionExpressionNode",
							"name": "sum",
							"arguments": [
								{
									"type": "columnReferenceNode",
									"columnName": "amount",
									"tableName": "orders",
									"tableAlias": "t1"
								}
							]
						}
					}
				],
				"fromItems": [
					{
						"type": "aliasedExpressionNode",
						"alias": "t1",
						"aliasPath": [
							"t1"
						],
						"expression": {
							"type": "tableReferenceNode",
							"tableName": "orders"
						}
					}
				],
				"joins": [],
				"conditions": [],
				"ordering": [],
				"grouping": [
					{
						"type": "groupByExpressionNode",
						"expression": {
							"type": "columnReferenceNode",
							"columnName": "region",
							"tableName": "orders",
							"tableAlias": "t1"
						}
					}
				]
			};
			deepEqual(ast, expected);
		});
	});
});