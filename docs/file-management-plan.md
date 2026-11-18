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
2. **Done.** `FileBrowser` (`src/components/files/file-browser.tsx`) used
   by `ClientFilePool` and `FilePool`: home-icon breadcrumb, folders first
   with counts, New folder, folder menu (rename / move / delete), select
   files then "Move to…" (`folder-dialogs.tsx`), drag files or folders onto
   a folder or a crumb, open folder in `?folder=` (pushState, Back works),
   search across all folders, Rename / Move in the file drawer. Grid sizes
   by container width (the application panel is narrow).
3. **Done.** Uploads go into the open folder; "Upload → A folder…"
   (`webkitdirectory`) and dropping folders (`dropped-items.ts`) call
   `ensureFolderPathsAction` once, then the upload queue with a per-file
   `folderId`. Dropped empty folders are created; a picked folder's empty
   subfolders aren't (the browser doesn't list them).
4. **Done.** Application files on `FileBrowser`; service pages show the
   client's folders with that service's files.
5. **Done.** Staff guide section "Client and case files: folders". Checked
   in the browser 2026-11-19 (local, headless Chromium): create, duplicate
   name refused, multi-select move, drag to folder, open + Back, rename file,
   subfolder, search, delete folder (contents moved up), folder upload made
   the folders. File bytes not checked locally: no `GCS_BUCKET` here.
