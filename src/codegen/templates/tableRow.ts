import { TableMetadata } from "../dbmetadata";
import { getColumnTypeScriptType, rowIfaceName } from "./common";
import { anno, iface, ifaceProp } from "../dsl";
import { InterfaceNode } from "../ast";

export function TableRowTemplate(table: TableMetadata): InterfaceNode {
	return iface(
		rowIfaceName(table),
		table.columns.map((col) => ifaceProp(
			col.niceName,
			anno(getColumnTypeScriptType(col))
		)),
		[],
		true
	);
}