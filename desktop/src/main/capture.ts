import { desktopCapturer, screen } from "electron";

// Screenshot of every monitor. Each screen is uploaded as its own
// Screenshot row (same takenAt, `monitors` = how many were captured), so
// the server never needs an image library to stitch them.

const MAX_EDGE = 2560;
const THUMB_WIDTH = 400;
const JPEG_QUALITY = 65;

export type Capture = { image: Buffer; thumb: Buffer };

export async function captureScreens(): Promise<Capture[]> {
  const displays = screen.getAllDisplays();
  const widest = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
  const tallest = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));
  const scale = Math.min(1, MAX_EDGE / Math.max(widest, tallest));

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(widest * scale), height: Math.round(tallest * scale) },
  });

  return sources
    .filter((source) => !source.thumbnail.isEmpty())
    .map((source) => ({
      image: source.thumbnail.toJPEG(JPEG_QUALITY),
      thumb: source.thumbnail.resize({ width: THUMB_WIDTH, quality: "good" }).toJPEG(60),
    }));
}
