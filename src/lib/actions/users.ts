"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, isAdmin, isSuperuser } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";

const ROLE_VALUES = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"] as const;

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
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      mfaEnabled: true,
      hourlyRate: true,
      phone: true,
      smsRemindersEnabled: true,
    },
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

  if (isAdmin(parsed.role) && !isSuperuser(session.user.role)) {
    throw new ForbiddenError("Only an Owner can create an Admin, Accountant, or Owner account");
  }

  const passwordHash = await bcrypt.hash(parsed.password, 12);
  const user = await prisma.user
    .create({
      data: {
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        role: parsed.role,
      },
    })
    .catch((e) => friendlyPrismaError(e, { duplicateMessages: { email: "A user with that email already exists" } }));

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
  phone: z.string().optional(),
  // Admin-set roster membership for meeting SMS/call reminders (see
  // src/lib/meeting-reminders.ts) — not a self-service preference like
  // emailNotificationsEnabled on /account.
  smsRemindersEnabled: z.boolean(),
});

export async function updateUser(input: z.infer<typeof updateSchema>) {
  const session = await requireRole(["ADMIN"]);
  const parsed = updateSchema.parse(input);

  const before = await prisma.user.findUniqueOrThrow({
    where: { id: parsed.userId },
    select: { name: true, email: true, role: true, active: true, phone: true, smsRemindersEnabled: true },
  });

  // DEVELOPER is break-glass-only — ROLE_VALUES above already keeps
  // parsed.role from ever being DEVELOPER, but an *existing* DEVELOPER row
  // still needs protecting from every other field (name/active/password),
  // for every actor including another DEVELOPER or an OWNER. Direct SQL only.
  if (before.role === "DEVELOPER") {
    throw new ForbiddenError("Developer accounts can only be changed directly in the database");
  }

  const isSelfEdit = parsed.userId === session.user.id;
  if (!isSelfEdit && !isSuperuser(session.user.role) && (isAdmin(before.role) || isAdmin(parsed.role))) {
    throw new ForbiddenError("Only an Owner can create, edit, or demote an Admin, Accountant, or Owner account");
  }

  if (isSelfEdit && (!parsed.active || parsed.role !== before.role)) {
    throw new Error("You can't deactivate or change your own role — have another admin do it");
  }

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
      phone: parsed.phone || null,
      smsRemindersEnabled: parsed.smsRemindersEnabled,
      ...(parsed.password ? { passwordHash: await bcrypt.hash(parsed.password, 12) } : {}),
    },
  });

  await recordFieldChanges({
    entityType: "User",
    entityId: parsed.userId,
    actorId: session.user.id,
    action: "update",
    before,
    after: {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      active: parsed.active,
      phone: parsed.phone || null,
      smsRemindersEnabled: parsed.smsRemindersEnabled,
    },
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
