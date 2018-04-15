import assert = require('assert');
import {QUsers} from "./fixtures";
import {QueryOutput} from "../src/query/typeMapping";
import {concat} from "../src/query/postgresql/functions/string/sql";
import {constant, selectExpression, selectNestedMany, selectNestedOne} from "../src/query/dsl";

describe(`Type mapping`, function () {
	it(`can derive column output types from a query selector object`, function () {
		const querySelect = {
			id: QUsers.id,
			name: QUsers.name
		};

		const result : QueryOutput<typeof querySelect> = {
			id: 1,
			name: 'Henry',
			//foo: ['bar']
		};
	});

	it(`can derive expression output types from a query selector object`, function () {
		const querySelect = {
			fullName: selectExpression<string>(concat(constant('Mr or Mrs'), QUsers.name.toColumnReferenceNode()))
		};

		const result : QueryOutput<typeof querySelect> = {
			fullName: 'Mr or Mrs Henry',
			// foo: [123]
		};
	});

	it(`can derive nestedMany output types from a query selector object`, function () {
		const querySelect = {
			users: selectNestedMany({
				name: QUsers.name
			})
		};

		const result : QueryOutput<typeof querySelect> = {
			users: [
				{
					// id: 123,
					name: 'Henry',
					// foo: 123
				}
			],
			// foo: [123]
		};
	});

	it(`can derive nestedOne output types from a query selector object`, function () {
		const querySelect = {
			user: selectNestedOne({
				name: QUsers.name
			})
		};

		const result : QueryOutput<typeof querySelect> = {
			user: {
				// id: 123,
				name: 'Henry',
			}
			,
			// foo: [123]
		};
	});

	it(`can derive a nullable column's output type`, function () {
		const querySelect = {
			deletedAt: QUsers.deletedAt
		};

		const result : QueryOutput<typeof querySelect> = {
			deletedAt: null
		};
	});
});