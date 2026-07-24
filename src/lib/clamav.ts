import net from "net";

// clamd INSTREAM protocol: a "zINSTREAM\0" command followed by the payload
// as <4-byte BE length><chunk> pairs, terminated by a zero-length chunk.
// clamd replies with a single line like "stream: OK" or
// "stream: <signature> FOUND" once it has scanned the whole stream.
const CLAMAV_HOST = process.env.CLAMAV_HOST || "clamav";
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT) || 3310;
const SCAN_TIMEOUT_MS = 15_000;
const CHUNK_SIZE = 64 * 1024;

export class VirusFoundError extends Error {
  constructor(public readonly signature: string) {
    super(`File rejected: infected with ${signature}`);
  }
}

function scanOverSocket(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT });
    const chunks: Buffer[] = [];

    socket.setTimeout(SCAN_TIMEOUT_MS, () => {
      socket.destroy(new Error("clamd scan timed out"));
    });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const sizeHeader = Buffer.alloc(4);
        sizeHeader.writeUInt32BE(chunk.length, 0);
        socket.write(sizeHeader);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });

    socket.on("data", (data) => chunks.push(data));
    socket.on("error", reject);
    socket.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim());
    });
  });
}

/**
 * Scans a buffer with clamd. In production, a scan that can't be completed
 * (clamd unreachable, timeout, etc.) rejects the upload — fail closed. In
 * other environments it logs and allows the file through, so local dev
 * doesn't require a running clamd.
 */
export async function scanForViruses(buffer: Buffer): Promise<void> {
  let reply: string;
  try {
    reply = await scanOverSocket(buffer);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Virus scan unavailable, upload rejected");
    }
    console.warn("[clamav] scan skipped (clamd unreachable in this environment):", error);
    return;
  }

  const match = reply.match(/^stream:\s*(.+)\s+FOUND$/);
  if (match) throw new VirusFoundError(match[1]);
  if (!/^stream:\s*OK$/.test(reply)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Virus scan returned an unexpected response: ${reply}`);
    }
    console.warn(`[clamav] unexpected response, allowing file through in this environment: ${reply}`);
  }
}
