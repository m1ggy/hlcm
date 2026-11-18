"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  Home,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createFolderAction,
  deleteFolderAction,
  ensureFolderPathsAction,
  moveFilesAction,
  moveFolderAction,
  renameFolderAction,
} from "@/lib/actions/folders";
import { renameFile } from "@/lib/actions/files";
import { unexpectedErrorMessage, type ActionResult } from "@/lib/action-result";
import { MAX_FILE_BYTES, fileTooLargeMessage } from "@/lib/file-limits";
import type { FolderOwner, FolderRow } from "@/lib/file-folders";
import { cn } from "@/lib/utils";
import { useUpload } from "./use-upload";
import { UploadProgress } from "./upload-progress";
import { reportBatch } from "./report-batch";
import { useJustAdded } from "./use-just-added";
import { FileCard } from "./file-card";
import { FileInfoDrawer } from "./file-info-drawer";
import { MoveDialog, NameDialog, subtreeIds } from "./folder-dialogs";
import { fromDrop, fromInput, isFileDrag, type PickedItems } from "./dropped-items";
import type { FileRow } from "./types";

// A client's or an application's files with folders (docs/file-management-plan.md).
// The whole tree and every file come down with the page, so opening a folder
// is instant and only the URL (?folder=) changes; Back steps out again.
//
// Drag a file card (or the selection) onto a folder or a breadcrumb to move
// it; drop files or whole folders from the computer anywhere to upload into
// the open folder, or onto a folder card to upload into that one.

const FILES_TYPE = "application/x-carenela-files";
const FOLDER_TYPE = "application/x-carenela-folder";

type DialogState =
  | { kind: "newFolder" }
  | { kind: "renameFolder"; folder: FolderRow }
  | { kind: "renameFile"; file: FileRow }
  | { kind: "moveFiles"; ids: string[]; current: string | null }
  | { kind: "moveFolder"; folder: FolderRow }
  | null;

export function FileBrowser({
  owner,
  folders: serverFolders,
  files,
  canEdit,
  uploadExtra,
  onDeleteFile,
  signAction,
  emptyText = "No files yet",
}: {
  owner: FolderOwner;
  folders: FolderRow[];
  files: FileRow[];
  canEdit: boolean;
  /** Added to every upload's form (a service page's clientServiceId). */
  uploadExtra?: Record<string, string>;
  onDeleteFile: (fileId: string) => Promise<ActionResult<unknown>>;
  signAction?: (file: FileRow) => React.ReactNode;
  emptyText?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { status: uploadStatus, uploadMany, cancel: cancelUpload, uploading } = useUpload();
  const shownFiles = useJustAdded(files);
  const shownFolders = useJustAdded(serverFolders);
  const folders = shownFolders.rows;
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id, "__top", "__here"
  const [activeFile, setActiveFile] = useState<FileRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const requested = searchParams.get("folder");
  const currentId = requested && byId.has(requested) ? requested : null;

  const trail = useMemo(() => {
    const out: FolderRow[] = [];
    let cursor = currentId ? byId.get(currentId) : undefined;
    while (cursor && out.length < 25) {
      out.unshift(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return out;
  }, [currentId, byId]);

  const pathOf = (folderId: string | null | undefined) => {
    const names: string[] = [];
    let cursor = folderId ? byId.get(folderId) : undefined;
    while (cursor && names.length < 25) {
      names.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return names.length ? names.join(" / ") : "Files";
  };

  // Counts come from the files on this page — on a service page that's only
  // that service's files, which is what the folder shows when opened.
  const counts = useMemo(() => {
    const out = new Map<string, { files: number; folders: number }>();
    const bump = (id: string | null | undefined, key: "files" | "folders") => {
      if (!id) return;
      const c = out.get(id) ?? { files: 0, folders: 0 };
      c[key]++;
      out.set(id, c);
    };
    for (const f of shownFiles.rows) bump(f.folderId, "files");
    for (const f of folders) bump(f.parentId, "folders");
    return out;
  }, [shownFiles.rows, folders]);

  const q = query.trim().toLowerCase();
  const visibleFolders = (
    q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders.filter((f) => f.parentId === currentId)
  ).sort((a, b) => a.name.localeCompare(b.name));
  const visibleFiles = q
    ? shownFiles.rows.filter((f) => f.fileName.toLowerCase().includes(q))
    : shownFiles.rows.filter((f) => (f.folderId ?? null) === currentId);

  function openFolder(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("folder", id);
    else params.delete("folder");
    const qs = params.toString();
    window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
    setSelected(new Set());
    setQuery("");
  }

  /** Runs an action; on success refreshes and calls `then`, on failure toasts. */
  function run<T>(fn: () => Promise<ActionResult<T>>, then?: (data: T) => void, fallback = "That didn't work. Please try again.") {
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        then?.(result.data);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, fallback));
      }
    });
  }

  function moveFilesTo(ids: string[], folderId: string | null) {
    run(
      () => moveFilesAction(owner, ids, folderId),
      (n) => {
        toast.success(`Moved ${n} file${n === 1 ? "" : "s"} to ${pathOf(folderId)}`);
        setSelected(new Set());
        setDialog(null);
      }
    );
  }

  function moveFolderTo(folderId: string, parentId: string | null) {
    run(
      () => moveFolderAction(folderId, parentId),
      () => {
        toast.success(`Moved to ${pathOf(parentId)}`);
        setDialog(null);
      }
    );
  }

  async function uploadInto(items: PickedItems, baseId: string | null) {
    if (items.files.length === 0 && items.dirs.length === 0) {
      toast.error("Nothing to upload");
      return;
    }
    const big = items.files.find((f) => f.file.size > MAX_FILE_BYTES);
    if (big) {
      toast.error(fileTooLargeMessage(big.file.name));
      return;
    }
    let dirIds: Record<string, string> = {};
    if (items.dirs.length > 0) {
      try {
        const result = await ensureFolderPathsAction(owner, baseId, items.dirs);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        dirIds = result.data;
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't create the folders. Please try again."));
        return;
      }
      if (items.files.length === 0) {
        toast.success(items.dirs.length === 1 ? "Folder created" : `${items.dirs.length} folders created`);
        router.refresh();
        return;
      }
    }
    const outcome = await uploadMany(
      owner.kind,
      owner.id,
      items.files.map((f) => f.file),
      (_file, i) => {
        const dir = items.files[i].dir;
        const folderId = dir ? dirIds[dir] : baseId;
        return { ...uploadExtra, ...(folderId && { folderId }) };
      }
    );
    for (const { data } of outcome.uploaded) shownFiles.add(data as FileRow);
    reportBatch(outcome);
    if (outcome.uploaded.length > 0 || items.dirs.length > 0) router.refresh();
  }

  function handleDeleteFile(fileId: string) {
    setDeletingId(fileId);
    startTransition(async () => {
      try {
        const result = await onDeleteFile(fileId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        shownFiles.remove(fileId);
        setDrawerOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Delete failed. Please try again."));
      } finally {
        setDeletingId(null);
      }
    });
  }

  function deleteFolder(folder: FolderRow) {
    const c = counts.get(folder.id);
    const inside = [
      c?.files ? `${c.files} file${c.files === 1 ? "" : "s"}` : null,
      c?.folders ? `${c.folders} folder${c.folders === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    const where = pathOf(folder.parentId);
    const message = inside.length
      ? `Delete the folder "${folder.name}"? Its ${inside.join(" and ")} will move to ${where}. No files are deleted.`
      : `Delete the empty folder "${folder.name}"?`;
    if (!confirm(message)) return;
    run(() => deleteFolderAction(folder.id), () => {
      shownFolders.remove(folder.id);
      if (currentId === folder.id) openFolder(folder.parentId);
    });
  }

  // ---- drag and drop -------------------------------------------------------

  function dragFiles(e: React.DragEvent, file: FileRow) {
    const ids = selected.has(file.id) ? [...selected] : [file.id];
    e.dataTransfer.setData(FILES_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  }

  function dragFolder(e: React.DragEvent, folder: FolderRow) {
    e.dataTransfer.setData(FOLDER_TYPE, folder.id);
    e.dataTransfer.effectAllowed = "move";
  }

  const carries = (e: React.DragEvent) => {
    const types = [...e.dataTransfer.types];
    return types.includes(FILES_TYPE) || types.includes(FOLDER_TYPE) || (canEdit && isFileDrag(e));
  };

  /** Props for anything files/folders can be dropped on. `target` null = top level. */
  function dropProps(key: string, target: string | null) {
    if (!canEdit) return {};
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!carries(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = isFileDrag(e) ? "copy" : "move";
        setDropTarget(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget((t) => (t === key ? null : t));
      },
      onDrop: (e: React.DragEvent) => {
        if (!carries(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        const fileIds = e.dataTransfer.getData(FILES_TYPE);
        const folderId = e.dataTransfer.getData(FOLDER_TYPE);
        if (fileIds) {
          const ids = (JSON.parse(fileIds) as string[]).filter((id) => {
            const f = shownFiles.rows.find((r) => r.id === id);
            return f && (f.folderId ?? null) !== target;
          });
          if (ids.length) moveFilesTo(ids, target);
        } else if (folderId) {
          if (folderId === target) return;
          if (target && subtreeIds(folders, folderId).has(target)) {
            toast.error("A folder can't go inside itself");
            return;
          }
          if (byId.get(folderId)?.parentId === target) return;
          moveFolderTo(folderId, target);
        } else if (isFileDrag(e)) {
          // Read the entries now — the browser clears them after this event.
          void fromDrop(e.dataTransfer).then((items) => uploadInto(items, target));
        }
      },
    };
  }

  // ---- render --------------------------------------------------------------

  // The top level is a home icon — the card around this is already titled "Files".
  const crumb = (key: string, id: string | null, label: string, last: boolean) => (
    <button
      key={key}
      type="button"
      onClick={() => openFolder(id)}
      disabled={last}
      aria-label={id === null ? label : undefined}
      title={id === null ? "All files" : undefined}
      {...dropProps(`crumb:${key}`, id)}
      className={cn(
        "truncate rounded px-1 py-0.5 hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent",
        last ? "font-medium text-foreground" : "text-muted-foreground",
        dropTarget === `crumb:${key}` && "bg-primary/10 ring-1 ring-primary"
      )}
    >
      {id === null ? <Home className="size-3.5" /> : label}
    </button>
  );

  const selectedIds = [...selected].filter((id) => visibleFiles.some((f) => f.id === id));

  return (
    <div
      className={cn("@container relative space-y-3 rounded-lg", dropTarget === "__here" && "ring-2 ring-primary ring-offset-4 ring-offset-background")}
      {...dropProps("__here", currentId)}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Folder" className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
          {crumb("__top", null, "Files", trail.length === 0 && !q)}
          {trail.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              {crumb(f.id, f.id, f.name, i === trail.length - 1 && !q)}
            </span>
          ))}
          {q && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <ChevronRight className="size-3.5 shrink-0" /> Search
            </span>
          )}
        </nav>
        <div className="relative w-full sm:w-48">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all folders"
            aria-label="Search files"
            className="h-8 pl-7"
          />
        </div>
        {canEdit && (
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "newFolder" })}>
              <FolderPlus className="size-3.5" /> New folder
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" loading={uploading} />}>
                <Upload className="size-3.5" /> Upload
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                  <Upload /> Files…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => folderInput.current?.click()}>
                  <FolderUp /> A folder…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const items = fromInput(e.currentTarget.files);
                e.currentTarget.value = "";
                void uploadInto(items, currentId);
              }}
            />
            <input
              ref={(el) => {
                folderInput.current = el;
                el?.setAttribute("webkitdirectory", "");
              }}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const items = fromInput(e.currentTarget.files);
                e.currentTarget.value = "";
                void uploadInto(items, currentId);
              }}
            />
          </>
        )}
      </div>

      <UploadProgress status={uploadStatus} onCancel={cancelUpload} />

      {canEdit && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm">
          <span className="font-medium">{selectedIds.length} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // From search results the files can be in different folders;
              // "current" only blocks a no-op move when they all share one.
              const homes = new Set(selectedIds.map((id) => shownFiles.rows.find((f) => f.id === id)?.folderId ?? null));
              const current = homes.size === 1 ? [...homes][0] : "__mixed";
              setDialog({ kind: "moveFiles", ids: selectedIds, current });
            }}
          >
            <FolderInput className="size-3.5" /> Move to…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="size-3.5" /> Clear
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Or drag them onto a folder</span>
        </div>
      )}

      {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {q ? "Nothing matches that search" : currentId ? "This folder is empty" : emptyText}
          {canEdit && !q && <span className="block text-xs">Drop files or folders here to upload</span>}
        </p>
      ) : (
        // Sized by the browser's own width, not the window: on an application
        // it sits in a narrow side panel.
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @3xl:grid-cols-3">
          {visibleFolders.map((folder) => {
            const c = counts.get(folder.id);
            const summary =
              [c?.folders ? `${c.folders} folder${c.folders === 1 ? "" : "s"}` : null, `${c?.files ?? 0} file${c?.files === 1 ? "" : "s"}`]
                .filter(Boolean)
                .join(" · ");
            return (
              <Card
                key={folder.id}
                draggable={canEdit || undefined}
                onDragStart={canEdit ? (e) => dragFolder(e, folder) : undefined}
                {...dropProps(`folder:${folder.id}`, folder.id)}
                className={cn(
                  "relative min-w-0 flex-row items-center gap-2.5 p-3 hover:bg-accent/50",
                  dropTarget === `folder:${folder.id}` && "bg-primary/10 ring-2 ring-primary"
                )}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Folder className="size-4" />
                </div>
                <button
                  type="button"
                  onClick={() => openFolder(folder.id)}
                  className="min-w-0 flex-1 text-left after:absolute after:inset-0"
                >
                  <p className="truncate text-sm font-medium" title={folder.name}>
                    {folder.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{q ? `in ${pathOf(folder.parentId)}` : summary}</p>
                </button>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" className="relative z-10" title="Folder options" />}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDialog({ kind: "renameFolder", folder })}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDialog({ kind: "moveFolder", folder })}>
                        <FolderInput /> Move to…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => deleteFolder(folder)}>
                        <Trash2 /> Delete folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </Card>
            );
          })}
          {visibleFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              folderLabel={q ? pathOf(file.folderId) : undefined}
              selected={selected.has(file.id)}
              onSelectedChange={
                canEdit
                  ? (on) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (on) next.add(file.id);
                        else next.delete(file.id);
                        return next;
                      })
                  : undefined
              }
              onDragStart={canEdit ? (e) => dragFiles(e, file) : undefined}
              onInfo={() => {
                setActiveFile(file);
                setDrawerOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <FileInfoDrawer
        file={activeFile}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        canEdit={canEdit}
        isDeleting={isPending && deletingId === activeFile?.id}
        onDelete={() => activeFile && handleDeleteFile(activeFile.id)}
        onChanged={() => router.refresh()}
        signAction={activeFile && signAction ? signAction(activeFile) : undefined}
        extraActions={
          canEdit && activeFile ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "renameFile", file: activeFile })}>
                <Pencil className="size-3.5" /> Rename
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: "moveFiles", ids: [activeFile.id], current: activeFile.folderId ?? null })}
              >
                <FolderInput className="size-3.5" /> Move
              </Button>
            </>
          ) : undefined
        }
      />

      <NameDialog
        open={dialog?.kind === "newFolder" || dialog?.kind === "renameFolder" || dialog?.kind === "renameFile"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "newFolder" ? `New folder in ${pathOf(currentId)}` : dialog?.kind === "renameFile" ? "Rename file" : "Rename folder"}
        label={dialog?.kind === "renameFile" ? "File name" : "Folder name"}
        initial={dialog?.kind === "renameFolder" ? dialog.folder.name : dialog?.kind === "renameFile" ? dialog.file.fileName : ""}
        submitLabel={dialog?.kind === "newFolder" ? "Create" : "Rename"}
        pending={isPending}
        onSubmit={(name) => {
          if (dialog?.kind === "newFolder") {
            run(() => createFolderAction(owner, currentId, name), (folder) => {
              shownFolders.add(folder);
              setDialog(null);
            });
          } else if (dialog?.kind === "renameFolder") {
            run(() => renameFolderAction(dialog.folder.id, name), () => setDialog(null));
          } else if (dialog?.kind === "renameFile") {
            const fileId = dialog.file.id;
            run(() => renameFile(fileId, name), () => {
              setDialog(null);
              setActiveFile((f) => (f && f.id === fileId ? { ...f, fileName: name } : f));
            });
          }
        }}
      />

      <MoveDialog
        open={dialog?.kind === "moveFiles" || dialog?.kind === "moveFolder"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === "moveFolder"
            ? `Move "${dialog.folder.name}"`
            : dialog?.kind === "moveFiles" && dialog.ids.length === 1
              ? "Move file"
              : `Move ${dialog?.kind === "moveFiles" ? dialog.ids.length : ""} files`
        }
        folders={folders}
        hide={dialog?.kind === "moveFolder" ? subtreeIds(folders, dialog.folder.id) : undefined}
        current={dialog?.kind === "moveFolder" ? dialog.folder.parentId : dialog?.kind === "moveFiles" ? dialog.current : null}
        pending={isPending}
        onMove={(target) => {
          if (dialog?.kind === "moveFolder") moveFolderTo(dialog.folder.id, target);
          else if (dialog?.kind === "moveFiles") {
            moveFilesTo(dialog.ids, target);
            setDrawerOpen(false);
          }
        }}
      />
    </div>
  );
}
