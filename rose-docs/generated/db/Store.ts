// Generated file; do not manually edit, as your changes will be overwritten!
/* eslint-disable */
import * as rose from 'rose';

export interface StoreRow {
	addressId: number;
	lastUpdate: Date;
	managerStaffId: number;
	name: string;
	storeId: number;
}

export interface StoreInsertRow {
	addressId: number;
	lastUpdate?: Date;
	managerStaffId: number;
	name: string;
	storeId?: number;
}

export class TStore extends rose.QueryTable {
	addressId = new rose.ColumnMetamodel<number>(this.$table, 'address_id');
	lastUpdate = new rose.ColumnMetamodel<Date>(this.$table, 'last_update');
	managerStaffId = new rose.ColumnMetamodel<number>(this.$table, 'manager_staff_id');
	name = new rose.ColumnMetamodel<string>(this.$table, 'name');
	storeId = new rose.ColumnMetamodel<number>(this.$table, 'store_id');

	constructor ($tableAlias?: string) {
		super(new rose.TableMetamodel('store', $tableAlias));
	}

}

export const QStore = rose.deepFreeze(new TStore());
export const StoreAllColumns = {
	addressId: QStore.addressId,
	lastUpdate: QStore.lastUpdate,
	managerStaffId: QStore.managerStaffId,
	name: QStore.name,
	storeId: QStore.storeId,
};
export const StoreDefaultQueries = {
	getOne: (function getOne() {
		interface Params {
			storeId: number;
		}

		const P = new rose.ParamsWrapper<Params>();
		return rose.select<typeof StoreAllColumns, Params>(StoreAllColumns).where(QStore.storeId.eq(P.get((p) => p.storeId))).prepare();
	})(),
	insertOne: function updateOne(row: StoreInsertRow) {
		return rose.insertFromObject<TStore, StoreInsertRow, {}>(QStore, row).prepare();
	},
	updateOne: function updateOne(updates: rose.PartialTableColumns<TStore>) {
		interface Params {
			storeId: number;
		}

		const P = new rose.ParamsWrapper<Params>();
		return rose.updateFromObject<TStore, Params>(QStore, updates).where(QStore.storeId.eq(P.get((p) => p.storeId))).prepare();
	},
	deleteOne: (function deleteOne() {
		interface Params {
			storeId: number;
		}

		const P = new rose.ParamsWrapper<Params>();
		return rose.deleteFrom<Params>(QStore).where(QStore.storeId.eq(P.get((p) => p.storeId))).prepare();
	})(),
};
