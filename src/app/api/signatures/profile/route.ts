import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { readStoredFile } from "@/lib/storage";

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await prisma.signatureProfile.findUnique({ where: { userId: session.user.id } });
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = await readStoredFile(profile.signatureImageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-cache" },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw error;
  }
}
