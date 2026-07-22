// Next.js 16 renamed the "middleware" file convention to "proxy"; it now
// defaults to the Node.js runtime instead of Edge (see next's proxy.md docs),
// so this can safely use the full auth config (Prisma/bcrypt included).
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
