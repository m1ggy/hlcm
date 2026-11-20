"use client";

import { useState } from "react";
import { Eye, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FileTypeIcon } from "./file-icon";
import { formatBytes } from "./format-bytes";
import { canPreview, FilePreviewDialog } from "./file-preview-dialog";
import type { FileRow } from "./types";

export function FileCard({
  file,
  onInfo,
  selected,
  onSelectedChange,
  onDragStart,
  folderLabel,
}: {
  file: FileRow;
  onInfo: () => void;
  /** With onSelectedChange: shows a checkbox (FileBrowser's multi-select). */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** Makes the card draggable onto a folder. */
  onDragStart?: (e: React.DragEvent) => void;
  /** Search results: which folder the file is in. */
  folderLabel?: string;
}) {
  const [previewing, setPreviewing] = useState(false);
  const previewable = canPreview(file.mimeType);
  return (
    <Card
      className={cn("relative min-w-0 gap-2 p-3", selected && "ring-2 ring-primary")}
      draggable={onDragStart ? true : undefined}
      onDragStart={onDragStart}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        title="File info"
        onClick={onInfo}
        className="absolute top-2 right-2"
      >
        <Info className="size-3.5" />
      </Button>
      {previewable && (
        <>
          <Button variant="ghost" size="icon-sm" title="Preview" onClick={() => setPreviewing(true)} className="absolute top-9 right-2">
            <Eye className="size-3.5" />
          </Button>
          <FilePreviewDialog file={file} open={previewing} onOpenChange={setPreviewing} />
        </>
      )}

      <div className="flex min-w-0 items-start gap-2.5 pr-7">
        {onSelectedChange && (
          <Checkbox
            checked={!!selected}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
            aria-label={`Select ${file.fileName}`}
            className="mt-2.5"
          />
        )}
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileTypeIcon mimeType={file.mimeType} className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          {previewable ? (
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              className="block max-w-full truncate text-left text-sm font-medium hover:underline"
              title={`Preview ${file.fileName}`}
            >
              {file.fileName}
            </button>
          ) : (
            <p className="truncate text-sm font-medium" title={file.fileName}>
              {file.fileName}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}
          </p>
          <p className="truncate text-xs text-muted-foreground">{file.uploadedBy.name}</p>
          {folderLabel && <p className="truncate text-xs text-muted-foreground">in {folderLabel}</p>}
        </div>
      </div>

      {(file.versionCount > 1 || file.isSigned) && (
        <div className="flex flex-wrap gap-1">
          {file.versionCount > 1 && (
            <Badge variant="outline" className="text-[0.65rem]">
              v{file.versionCount}
            </Badge>
          )}
          {file.isSigned && (
            <Badge variant="outline" className="text-[0.65rem]">
              Signed
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
