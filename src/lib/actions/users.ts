"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";

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
    select: { id: true, name: true, email: true, role: true, active: true, mfaEnabled: true, hourlyRate: true },
  });
}

const rateSchema = z.object({
  userId: z.string().min(1),
  hourlyRate: z.coerce.number().min(0).max(1000).nullable(),
});

export async function setHourlyRate(input: { userId: string; hourlyRate: number | null }) {
  const session = await requireRole(["ADMIN"]);
  const parsed = rateSchema.parse(input);

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: parsed.userId },
    select: { hourlyRate: true },
  });
  const user = await prisma.user.update({
    where: { id: parsed.userId },
    data: { hourlyRate: parsed.hourlyRate },
  });

  await recordAudit({
    entityType: "User",
    entityId: parsed.userId,
    action: "set_rate",
    actorId: session.user.id,
    field: "hourlyRate",
    oldValue: before.hourlyRate,
    newValue: parsed.hourlyRate,
  });

  revalidatePath("/admin/users");
  return user;
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

const updateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(ROLE_VALUES),
  active: z.boolean(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
});

export async function updateUser(input: z.infer<typeof updateSchema>) {
  const session = await requireRole(["ADMIN"]);
  const parsed = updateSchema.parse(input);

  if (parsed.userId === session.user.id && (!parsed.active || parsed.role !== "ADMIN")) {
    throw new Error("You can't deactivate or demote your own account — have another admin do it");
  }

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: parsed.userId },
    select: { name: true, email: true, role: true, active: true },
  });

  const existing = await prisma.user.findUnique({ where: { email: parsed.email } });
  if (existing && existing.id !== parsed.userId) {
    throw new Error("Another user already has that email");
  }

  const user = await prisma.user.update({
    where: { id: parsed.userId },
    data: {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      active: parsed.active,
      ...(parsed.password ? { passwordHash: await bcrypt.hash(parsed.password, 12) } : {}),
    },
  });

  await recordFieldChanges({
    entityType: "User",
    entityId: parsed.userId,
    actorId: session.user.id,
    action: "update",
    before,
    after: { name: parsed.name, email: parsed.email, role: parsed.role, active: parsed.active },
  });
  if (parsed.password) {
    await recordAudit({
      entityType: "User",
      entityId: parsed.userId,
      action: "change_password",
      actorId: session.user.id,
    });
  }

  revalidatePath("/admin/users");
  return user;
}
