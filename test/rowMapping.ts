import assert = require('assert');
import {QAgencies, QLocations, QUsers} from "./fixtures";
import {Column} from "../src/query/metamodel";
import {mapRowsToClass, mapRowToClass} from "../src/rowMapping/rowMapping";
import {Expression, Nested} from "../src/query/dsl";
import {
	AliasedExpressionNode,
	BinaryOperationNode,
	ColumnReferenceNode,
	ConstantNode,
	FunctionExpressionNode,
	SelectOutputExpression,
	UnaryOperationNode
} from "../src/query/ast";
import {count} from "../src/query/postgresql/functions";
import {UnsupportedOperationError} from "../src/errors";

describe("Row mapping", function () {
	it("Can map a single number column to a data class", function () {
		class QuerySelect {
			@Column(QUsers.id)
			id : number;
		}
		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
				type: "columnReferenceNode",
				tableName: "Users",
				columnName: "id",
				tableAlias: "t1"
			}
		];
		const row = {
			id: 123
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.strictEqual(result.id, 123);
	});

	it("Can map a single string column to a data class, with the property name a different name to the column", function () {
		class QuerySelect {
			@Column(QUsers.name)
			userName: string;
		}
		const outputExpressions : SelectOutputExpression[] = [
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "userName",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "name",
					tableAlias: "t1"
				}
			},
		];
		const row = {
			userName: "Phileas Fogg"
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.equal(result.userName, "Phileas Fogg");
	});

	it("Can map a nested sub-query", function () {
		class QuerySelectNested {
			@Column(QUsers.id)
			id : number;
		}

		class QuerySelect {
			@Column(QLocations.id)
			id : number;

			@Nested(QuerySelectNested)
			users : Array<QuerySelectNested>;
		}

		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Locations",
					columnName: "id",
					tableAlias: "t2"
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "users.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			}
		];
		// TODO: map nested rows to a single outer object
		const row = {
			id: 123,
			"users.id": 456
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.deepEqual(result, {
			id: 123,
			users: [
				{
					id: 456
				}
			]
		});
	});

	it("Can map a nested sub-query with multiple columns", function () {
		class QuerySelectNested {
			@Column(QUsers.id)
			id : number;

			@Column(QUsers.name)
			userName: string;
		}

		class QuerySelect {
			@Column(QLocations.id)
			id : number;

			@Nested(QuerySelectNested)
			users : Array<QuerySelectNested>;
		}

		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
				type: "columnReferenceNode",
				tableName: "Locations",
				columnName: "id",
				tableAlias: "t2"
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "users.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "users.userName",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			}
		];
		// TODO: map nested rows to a single outer object
		const row = {
			id: 123,
			"users.id": 456,
			"users.userName": "Phileas Fogg"
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.deepEqual(result, {
			id: 123,
			users: [
				{
					id: 456,
					userName: "Phileas Fogg"
				}
			]
		});
	});

	it("Can map a deeply nested sub-query", function () {


		class QuerySelectDeeplyNested {
			@Column(QUsers.id)
			id : number;
		}

		class QuerySelectNested {
			@Column(QLocations.id)
			id : number;

			@Nested(QuerySelectNested)
			users : Array<QuerySelectDeeplyNested>;
		}

		class QuerySelect {
			@Column(QAgencies.id)
			id : number;

			@Nested(QuerySelectNested)
			locations : Array<QuerySelectNested>;
		}

		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
				type: "columnReferenceNode",
				tableName: "Locations",
				columnName: "id",
				tableAlias: "t3"
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "locations.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Locations",
					columnName: "id",
					tableAlias: "t2"
				}
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "locations.users.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			}
		];
		// TODO: map nested rows to a single outer object
		const row = {
			id: 123,
			"locations.id": 456,
			"locations.users.id": 789
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.deepEqual(result, {
			id: 123,
			locations: [
				{
					id: 456,
					users: [
						{
							id: 789
						}
					]
				}
			]
		});
	});

	it("Can map a nested sub-query with multiple rows", function () {
		class QuerySelectNested {
			@Column(QUsers.id)
			id : number;
		}

		class QuerySelect {
			@Column(QLocations.id)
			id : number;

			@Nested(QuerySelectNested)
			users : Array<QuerySelectNested>;
		}

		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
				type: "columnReferenceNode",
				tableName: "Locations",
				columnName: "id",
				tableAlias: "t2"
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "users.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			}
		];

		const rows = [
			{
				id: 123,
				"users.id": 456
			},
			{
				id: 123,
				"users.id": 789
			}
		];

		const result = mapRowsToClass(QuerySelect, outputExpressions, rows);

		assert.deepEqual(result, [
			{
				id: 123,
				users: [
					{
						id: 456
					},
					{
						id: 789
					}
				]
			}
		]);
	});

	it("Can map a nested sub-query with loooots of rows", function () {
		class QuerySelectNested {
			@Column(QUsers.id)
			id : number;
		}

		class QuerySelect {
			@Column(QLocations.id)
			id : number;

			@Nested(QuerySelectNested)
			users : Array<QuerySelectNested>;
		}

		const outputExpressions : SelectOutputExpression[] = [
			<ColumnReferenceNode> {
				type: "columnReferenceNode",
				tableName: "Locations",
				columnName: "id",
				tableAlias: "t2"
			},
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "users.id",
				expression: <ColumnReferenceNode> {
					type: "columnReferenceNode",
					tableName: "Users",
					columnName: "id",
					tableAlias: "t1"
				}
			}
		];

		const rows = [];
		const numNested = 100000;
		for (let i = 0; i < numNested; i++) {
			rows.push({
				id: 123,
				"users.id": i
			});
		}

		const result = mapRowsToClass(QuerySelect, outputExpressions, rows);

		assert.deepEqual(result.length, 1);
		assert.deepEqual(result[0].id, 123);
		assert.deepEqual(result[0].users.length, numNested);
	});

	xit("Preserves order of the rows", function () {

	});

	it("Can map from function expressions", function () {
		class QuerySelect {
			@Expression(count())
			countValue : number;
		}
		const outputExpressions : SelectOutputExpression[] = [
			<AliasedExpressionNode> {
				type: "aliasedExpressionNode",
				alias: "countValue",
				expression: <FunctionExpressionNode> {
					type: "functionExpressionNode",
					name: "count"
				}
			},
		];
		const row = {
			countValue: 123
		};

		const result = mapRowToClass(QuerySelect, outputExpressions, row);

		assert.strictEqual(result.countValue, 123);
	});

	it("Cannot map from un-aliased function expressions", function () {
		class QuerySelect {
			@Expression(count())
			countValue : number;
		}
		const outputExpressions : SelectOutputExpression[] = [
			<FunctionExpressionNode> {
				type: "functionExpressionNode",
				name: "count"
			}
		];
		const row = {
			countValue: 123
		};

		assert.throws(() => {
			mapRowToClass(QuerySelect, outputExpressions, row);
		}, UnsupportedOperationError);
	});

	it("Cannot map from constants", function () {
		class QuerySelect {
		}
		const outputExpressions : SelectOutputExpression[] = [
			<ConstantNode<any>> {
				type: "constantNode",
				getter: () => {}
			}
		];
		const row = {
			junk: 123
		};

		assert.throws(() => {
			mapRowToClass(QuerySelect, outputExpressions, row);
		}, UnsupportedOperationError);
	});

	it("Cannot map from binary operations", function () {
		class QuerySelect {
		}
		const outputExpressions : SelectOutputExpression[] = [
			<BinaryOperationNode> {
				type: "binaryOperationNode",
				operator: "=",
				left: <FunctionExpressionNode> {
					type: "functionExpressionNode",
					name: "count"
				},
				right: <FunctionExpressionNode> {
					type: "functionExpressionNode",
					name: "count"
				}
			}
		];
		const row = {
			junk: 123
		};

		assert.throws(() => {
			mapRowToClass(QuerySelect, outputExpressions, row);
		}, UnsupportedOperationError);
	});

	it("Cannot map from unary operations", function () {
		class QuerySelect {
		}
		const outputExpressions : SelectOutputExpression[] = [
			<UnaryOperationNode> {
				type: "unaryOperationNode",
				operator: "!",
				position: 'left'
			}
		];
		const row = {
			junk: 123
		};

		assert.throws(() => {
			mapRowToClass(QuerySelect, outputExpressions, row);
		}, UnsupportedOperationError);
	});
});