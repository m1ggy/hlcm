"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";

const ROLE_VALUES = ["ADMIN", "MANAGER", "STAFF", "CLIENT"] as const;

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLE_VALUES),
});

export async function listUsers() {
  await requireRole(["ADMIN"]);
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, mfaEnabled: true },
  });
}

export async function createUser(formData: FormData) {
  const session = await requireRole(["ADMIN"]);
  const parsed = userSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  const passwordHash = await bcrypt.hash(parsed.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: parsed.role,
    },
  });

  await recordAudit({
    entityType: "User",
    entityId: user.id,
    action: "create",
    actorId: session.user.id,
  });

  revalidatePath("/admin/users");
  return user;
}

export async function deactivateUser(userId: string) {
  const session = await requireRole(["ADMIN"]);
  const user = await prisma.user.update({ where: { id: userId }, data: { active: false } });

  await recordAudit({
    entityType: "User",
    entityId: userId,
    action: "deactivate",
    actorId: session.user.id,
  });

  revalidatePath("/admin/users");
  return user;
}
