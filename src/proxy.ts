// Next.js 16 renamed the "middleware" file convention to "proxy"; it now
// defaults to the Node.js runtime instead of Edge (see next's proxy.md docs),
// so this can safely use the full auth config (Prisma/bcrypt included).
export { auth as proxy } from "@/auth";

export const config = {
  // Brand files (logo, app icons) are public: the sign-in page shows them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/).*)"],
};
