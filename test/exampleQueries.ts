import {Column} from "../src/query/metamodel";
import {QLocations, QRecurringPayments} from "./fixtures";
import {and, col, constant, Expression, or, param, ParamsWrapper, row, select, subSelect} from "../src/query/dsl";
import {now, overlaps} from "../src/query/postgresql/functions/dateTime/functions";
import * as assert from "assert";
import {exists} from "../src/query/postgresql/functions/subquery/expressions";

describe(`Example queries`, function () {
	describe(`Recurring payments`, function () {
		/**
		 SELECT DISTINCT ON ("locationId")
		   *
		 FROM
		   "RecurringPayments"
		 JOIN "Locations" as loc ON loc."id" = "locationId"
		 WHERE
		   "nextDate" >= :now
		 AND loc."clientId" = :clientId
		 AND (
		   "endDate" IS NULL
		   OR "endDate" > "nextDate"
		 )
		 ORDER BY "locationId", "nextDate" ASC;
		 */
		it(`find the next active payment for all locations under a given client`, function () {
			const QRP = QRecurringPayments; // alias for brevity
			class QueryClass {
				@Column(QRP.id)
				id : number;

				@Column(QLocations.id)
				locationId : number;
			}
			const params = {
				clientId: 123
			};
			const query = select(QueryClass)
				.distinctOn(col(QRP.locationId))
				.join(QLocations)
				.on(QLocations.id.eq(QRP.locationId))
				.where(and(
					QRP.nextDate.gte(now()),
					QLocations.clientId.eq((p) => p.clientId),
					or(
						QRP.endDate.isNull(),
						QRP.endDate.gt(QRP.nextDate)
					)
				)).orderBy(
					QRP.locationId.asc(),
					QRP.nextDate.asc()
				);

			const result = query.toSql(params);

			const expected = ('SELECT DISTINCT ON ' +
				'("t2"."locationId") ' +
				'"t2"."id" as "id", "t1"."id" as "locationId" ' +
				'FROM "RecurringPayments" as "t2" ' +
				'INNER JOIN "Locations" as "t1" ON "t1"."id" = "t2"."locationId" ' +
				'WHERE ' +
				'("t2"."nextDate" >= now() AND ' +
				'"t1"."clientId" = $1 AND ' +
				'("t2"."endDate" IS NULL OR ' +
				'"t2"."endDate" > "t2"."nextDate")) ' +
				'ORDER BY "t2"."locationId" ASC, "t2"."nextDate" ASC');
			assert.equal(result.sql, expected);
		});

		/**
		 SELECT
		 EXISTS
		 (
			 SELECT
			 	*
			 FROM
			 	"RecurringPayments"
			 WHERE
			 	"locationId" = :locationId
			 AND ( (
			 	"endDate" IS NULL
			 	AND "startDate" = :startDate )
			 	OR  (
			 		"startDate", "endDate") OVERLAPS (:startDate, :endDate) )
			 LIMIT 1
		 ) AS "exists";
		 */
		it(`there exists a payment with a date range overlapping the given dates and location`, function () {
			const QRP = QRecurringPayments; // alias for brevity

			// Make our parameters type safe
			interface QueryParams {
				startDate : Date;
				endDate : Date;
				locationId : number;
			}
			// Make our use of parameters within the sub-query type safe
			const P = new ParamsWrapper<QueryParams>();
			// Define our sub-query before the query class. (We could also define it inline, at the expense of readability.)
			const subQuery = subSelect<QueryParams>(QRP.id)
				.where(and(
					QRP.locationId.eq(p => p.locationId),
					or(
						and(
							QRP.endDate.isNull(),
							QRP.startDate.eq(p => p.startDate)
						),
						overlaps(
							row(col(QRP.startDate), col(QRP.endDate)),
							row(P.get(p => p.startDate), P.get(p => p.endDate))
						)
					)
				))
				.limit(1)
				.toSubQuery();
			// Make the returned values type safe.
			class QueryClass {
				@Expression(exists(subQuery))
				exists : boolean;
			}

			const query = select<QueryClass, QueryParams>(QueryClass);

			const result = query.toSql({
				startDate: new Date(Date.parse("2017-05-11")),
				endDate: new Date(Date.parse("2017-06-11")),
				locationId: 123
			});

			const expected = 'SELECT EXISTS (' +
				'SELECT "t1"."id" FROM "RecurringPayments" as "t1" ' +
				'WHERE ("t1"."locationId" = $1 AND ' +
				'(' +
					'("t1"."endDate" IS NULL AND "t1"."startDate" = $2) ' +
					'OR ("t1"."startDate", "t1"."endDate") OVERLAPS ($3, $4))' +
				') ' +
				'LIMIT $5 OFFSET $6) ' +
				'as "exists"';

			assert.equal(result.sql, expected);
		});
	});
});