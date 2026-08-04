"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileTypeIcon } from "./file-icon";
import { formatBytes } from "./format-bytes";
import type { FileRow } from "./types";

export function FileCard({ file, onInfo }: { file: FileRow; onInfo: () => void }) {
  return (
    <Card className="relative min-w-0 gap-2 p-3">
      <Button
        variant="ghost"
        size="icon-sm"
        title="File info"
        onClick={onInfo}
        className="absolute top-2 right-2"
      >
        <Info className="size-3.5" />
      </Button>

      <div className="flex min-w-0 items-start gap-2.5 pr-7">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileTypeIcon mimeType={file.mimeType} className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-medium" title={file.fileName}>
            {file.fileName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatBytes(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()}
          </p>
          <p className="truncate text-xs text-muted-foreground">{file.uploadedBy.name}</p>
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
