import type { ReactNode } from "react";

export type Column<T> = {
  id: string;
  header: string;
  width?: string;
  render: (row: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedIds?: Set<string>;
  onSelectRow?: (id: string, multi: boolean) => void;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  empty?: ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedIds,
  onSelectRow,
  onRowClick,
  onRowDoubleClick,
  empty,
}: Props<T>) {
  if (rows.length === 0 && empty) {
    return <div className="v2-table-empty">{empty}</div>;
  }

  return (
    <div className="v2-table-wrap">
      <table className="v2-table">
        <thead>
          <tr>
            {onSelectRow ? (
              <th className="v2-table-check" aria-label="Sélection" />
            ) : null}
            {columns.map((c) => (
              <th key={c.id} style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            const selected = selectedIds?.has(id);
            return (
              <tr
                key={id}
                className={selected ? "selected" : ""}
                onClick={() => onRowClick?.(row)}
                onDoubleClick={() => onRowDoubleClick?.(row)}
              >
                {onSelectRow ? (
                  <td className="v2-table-check">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRow(id, e.shiftKey);
                      }}
                      aria-label={`Sélectionner ${id}`}
                    />
                  </td>
                ) : null}
                {columns.map((c) => (
                  <td key={c.id}>{c.render(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
