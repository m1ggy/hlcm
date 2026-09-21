// Single source of truth for the upload size cap, shared by the server
// actions (src/lib/actions/files.ts) and the file-pool components, so a file
// that will be rejected is caught in the browser instead of after uploading
// it. Keep at or below the request limits in next.config.ts
// (serverActions.bodySizeLimit / proxyClientMaxBodySize, 210mb) and clamd's
// StreamMaxLength in docker-compose.yml.
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_LABEL = "200MB";

export function fileTooLargeMessage(fileName?: string): string {
  return fileName ? `"${fileName}" is larger than ${MAX_FILE_LABEL}` : `File is larger than ${MAX_FILE_LABEL}`;
}
