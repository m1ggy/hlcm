"use client";

// Turns what was dropped or picked into files plus the folder each one sits
// in, relative to what was dropped ("Licenses/2026", "" for a loose file).
// Folder uploads recreate that structure under the open folder
// (docs/file-management-plan.md).

export type PickedFile = { file: File; dir: string };
export type PickedItems = { files: PickedFile[]; dirs: string[] };

// OS clutter nobody means to upload.
const JUNK = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const isJunk = (name: string) => JUNK.has(name.toLowerCase()) || name.startsWith("._");

function dirOf(path: string) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Every folder on the way to each path: "a/b" → "a", "a/b". */
function withAncestors(dirs: Iterable<string>) {
  const all = new Set<string>();
  for (const d of dirs) {
    const parts = d.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
  }
  return [...all].sort();
}

/** From an <input type="file"> — with `webkitdirectory` each file carries its path. */
export function fromInput(list: FileList | null): PickedItems {
  const files: PickedFile[] = [];
  for (const file of list ? [...list] : []) {
    if (isJunk(file.name)) continue;
    files.push({ file, dir: dirOf(file.webkitRelativePath || "") });
  }
  return { files, dirs: withAncestors(files.map((f) => f.dir)) };
}

function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns at most ~100 entries per call; keep reading until empty.
  return new Promise((resolve, reject) => {
    const out: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(out);
        else {
          out.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

/** From a drop: walks dropped folders (empty ones included). */
export async function fromDrop(data: DataTransfer): Promise<PickedItems> {
  const files: PickedFile[] = [];
  const dirs = new Set<string>();
  const entries = [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.() ?? null);

  // No entry API (old browser): plain files only.
  if (entries.every((e) => e === null)) {
    return fromInput(data.files);
  }

  async function walk(entry: FileSystemEntry, dir: string) {
    if (entry.isFile) {
      if (!isJunk(entry.name)) files.push({ file: await fileOf(entry as FileSystemFileEntry), dir });
      return;
    }
    if (entry.isDirectory) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      dirs.add(path);
      for (const child of await readAll((entry as FileSystemDirectoryEntry).createReader())) await walk(child, path);
    }
  }
  for (const entry of entries) if (entry) await walk(entry, "");
  return { files, dirs: withAncestors(dirs) };
}

/** True when a drag carries files from the computer (not a file card being moved). */
export function isFileDrag(e: React.DragEvent) {
  return [...e.dataTransfer.types].includes("Files");
}
