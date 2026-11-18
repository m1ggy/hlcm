# File management: folders, moving, renaming, folder uploads

Started 2026-11-19 on `feature/file-folders`.

## Goal

Client and application files are a flat grid today. Add a folder tree per
client and per application: create, rename, move and delete folders; move
files between folders; rename files; upload into the open folder; upload a
whole folder from the computer (its structure is recreated).

## Decisions

- **Where:** client files and application files only. Task, work-task,
  invoice, payroll and correspondence attachments stay flat (short lists tied
  to one record). A workspace-wide "Documents" area is not part of this.
- **Folders are database-only.** Storage keys are flat
  (`org/<org>/<uuid>`), so moving a file only changes `FileAsset.folderId`;
  nothing moves in the bucket.
- **One owner per tree.** A folder has exactly one of `clientId` /
  `applicationId` (CHECK constraint). Its parent, subfolders and files
  belong to that same owner; nothing moves across owners, since each owner
  has its own access check.
- **Unique sibling names, ignoring case.** Checked in
  `src/lib/file-folders.ts` under a per-owner advisory lock (Prisma can't
  model an expression index).
- **Deleting a folder never deletes files.** Its files and subfolders move up
  to its parent; a subfolder whose name is taken there becomes "Name (2)".
- **Renaming a file** changes only `FileAsset.fileName`; each version keeps
  the name it was uploaded with. Signed files can be moved and renamed
  (their bytes don't change).
- **Service pages:** `clientServiceId` stays a tag. A service page shows the
  client's folders with only that service's files; uploads there get both
  the tag and the open folder.
- Max depth 20, max 500 files per move, max 1000 folder paths per upload.

## Phases

1. **Done.** Schema + migration `20261119140000_file_folders`
   (`file_folders`, `file_assets.folderId`), tree logic in
   `src/lib/file-folders.ts`, actions in `src/lib/actions/folders.ts`,
   `folderId` on the client and application upload actions, `renameFile` in
   `src/lib/actions/files.ts`, tests in `tests/file-folders.test.ts`.
2. `FileBrowser` component replacing `ClientFilePool`: breadcrumb, folders
   first with file counts, New folder, rename/move/delete menu, select files
   then "Move to…" with a folder-tree picker, drag a file onto a folder or a
   crumb, open folder kept in `?folder=`, search across all folders.
3. Uploads: into the open folder; "Upload folder" (`webkitdirectory`) and
   drag-and-drop of folders (`webkitGetAsEntry`), calling
   `ensureFolderPathsAction` once and then the existing upload queue with a
   `folderId` per file (`useUpload.uploadMany` needs per-file extras).
4. Application files (`FilePool`) on `FileBrowser`; the service-page filter.
5. Staff guide section; manual check.
