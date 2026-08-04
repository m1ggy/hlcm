import { File, FileArchive, FileImage, FileSpreadsheet, FileText } from "lucide-react";

export function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType === "application/pdf" || mimeType.includes("word") || mimeType.includes("document")) {
    return <FileText className={className} />;
  }
  if (mimeType.includes("sheet") || mimeType.includes("csv") || mimeType.includes("excel")) {
    return <FileSpreadsheet className={className} />;
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed") || mimeType.includes("archive")) {
    return <FileArchive className={className} />;
  }
  return <File className={className} />;
}
