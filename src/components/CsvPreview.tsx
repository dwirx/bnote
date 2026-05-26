import { Database, FileText } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import type { CsvViewMode, FileDocument } from "@/types";
import { formatBytes } from "@/utils/files";

const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLUMNS = 50;

type CsvPreviewProps = {
  content: string;
  document: FileDocument;
  mode: CsvViewMode;
  onModeChange: (mode: CsvViewMode) => void;
  rawView: React.ReactNode;
};

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length && rows.length < MAX_PREVIEW_ROWS; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.map((cells) => cells.slice(0, MAX_PREVIEW_COLUMNS));
}

export function CsvPreview({ content, document, mode, onModeChange, rawView }: CsvPreviewProps) {
  const rows = parseCsvRows(content);
  const [header, ...body] = rows;
  const hasRows = rows.length > 0;
  const truncatedRows = document.truncated || content.split(/\r\n|\r|\n/).length > MAX_PREVIEW_ROWS;
  const maxColumns = Math.max(...rows.map((row) => row.length), 0);
  const truncatedColumns = rows.some((row) => row.length >= MAX_PREVIEW_COLUMNS);

  return (
    <div className="grid min-h-0 grid-rows-[34px_minmax(0,1fr)] rounded-lg border border-border bg-editor">
      <div className="flex items-center justify-between border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Database className="size-3.5 text-primary" />
          <span className="truncate">
            CSV preview
            {document.truncated ? `, first ${formatBytes(document.previewBytes)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === "table" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onModeChange("table")}
          >
            <Database className="size-3.5" />
            Table
          </Button>
          <Button
            size="sm"
            variant={mode === "raw" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onModeChange("raw")}
          >
            <FileText className="size-3.5" />
            Raw
          </Button>
        </div>
      </div>

      {mode === "raw" ? (
        rawView
      ) : (
        <div className="min-h-0 overflow-auto">
          {!hasRows ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No CSV rows found in the preview.
            </div>
          ) : (
            <div className="min-w-max p-3">
              <table className="border-collapse text-left text-xs">
                {header ? (
                  <thead>
                    <tr>
                      {header.map((cell, index) => (
                        <th
                          className="max-w-80 truncate border border-border bg-muted px-3 py-2 font-semibold text-foreground"
                          key={`${cell}-${index}`}
                          title={cell}
                        >
                          {cell || `Column ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr className="odd:bg-muted/20 hover:bg-accent/50" key={rowIndex}>
                      {Array.from({ length: maxColumns }).map((_, columnIndex) => (
                        <td
                          className="max-w-80 truncate border border-border px-3 py-1.5 text-editor-foreground"
                          key={columnIndex}
                          title={row[columnIndex] ?? ""}
                        >
                          {row[columnIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {truncatedRows || truncatedColumns ? (
                <div className="sticky bottom-0 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                  Preview is limited to {MAX_PREVIEW_ROWS} rows and {MAX_PREVIEW_COLUMNS} columns.
                  Use Raw mode or open externally for the full file.
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
