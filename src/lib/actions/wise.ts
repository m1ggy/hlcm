"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { listTimeEntries, listBreakDeductions } from "@/lib/actions/time-entries";
import { summarizeByUser, DEFAULT_TIMEZONE, type BreakDeductionRule } from "@/lib/time-entries";
import {
  getAccountRequirements,
  createRecipientAccount,
  createQuote,
  createTransfer,
  fundTransfer,
  simulateTransferCompletion,
  WiseConfigError,
  WiseApiError,
} from "@/lib/wise";

const SOURCE_CURRENCY = process.env.WISE_SOURCE_CURRENCY ?? "USD";

export async function getMyWiseRecipient() {
  const session = await requireSession();
  const recipient = await prisma.wiseRecipient.findUnique({
    where: { userId: session.user.id },
    select: { currency: true, accountHolderName: true, updatedAt: true },
  });
  return recipient;
}

/** Flattens Wise's dynamic requirement schema for one currency into a flat field list the form can render without knowing the country in advance. */
export async function getPayoutFields(currency: string) {
  await requireSession();
  let requirements;
  try {
    requirements = await getAccountRequirements({ source: SOURCE_CURRENCY, target: currency });
  } catch (error) {
    if (error instanceof WiseConfigError) {
      throw new Error("Wise isn't configured yet — ask an admin to set WISE_API_TOKEN / WISE_PROFILE_ID.");
    }
    if (error instanceof WiseApiError) throw new Error(error.message);
    throw error;
  }
  const primary = requirements[0];
  if (!primary) throw new Error(`Wise doesn't support payouts in ${currency}`);
  return {
    type: primary.type,
    fields: primary.fields.flatMap((group) => group.group),
  };
}

const saveRecipientSchema = z.object({
  currency: z.string().length(3),
  type: z.string().min(1),
  accountHolderName: z.string().min(1),
  fields: z.record(z.string(), z.string()),
});

export async function saveMyWiseRecipient(input: z.infer<typeof saveRecipientSchema>) {
  const session = await requireSession();
  const parsed = saveRecipientSchema.parse(input);

  let account: { id: number };
  try {
    account = await createRecipientAccount({
      currency: parsed.currency,
      type: parsed.type,
      accountHolderName: parsed.accountHolderName,
      legalType: "PRIVATE",
      details: parsed.fields,
    });
  } catch (error) {
    if (error instanceof WiseConfigError) {
      throw new Error("Wise isn't configured yet — ask an admin to set WISE_API_TOKEN / WISE_PROFILE_ID.");
    }
    if (error instanceof WiseApiError) throw new Error(error.message);
    throw error;
  }

  await prisma.wiseRecipient.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      currency: parsed.currency,
      accountHolderName: parsed.accountHolderName,
      legalType: "PRIVATE",
      wiseAccountId: String(account.id),
      fields: parsed.fields,
    },
    update: {
      currency: parsed.currency,
      accountHolderName: parsed.accountHolderName,
      wiseAccountId: String(account.id),
      fields: parsed.fields,
    },
  });

  await recordAudit({
    entityType: "WiseRecipient",
    entityId: session.user.id,
    action: "save",
    actorId: session.user.id,
    field: "currency",
    newValue: parsed.currency,
  });

  revalidatePath("/account");
  revalidatePath("/time");
}

const payoutRangeSchema = z.object({
  userId: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
  // The admin's own effective timezone (from the report they're paying
  // out of) — needed so a day's worked hours get bucketed the same way
  // here as they were on screen, since a TimesheetBreakDeduction is
  // applied per calendar day. Falls back to the company default if the
  // caller (e.g. a script) doesn't have one to pass.
  timeZone: z.string().optional(),
});

export async function payUserViaWise(input: z.infer<typeof payoutRangeSchema>) {
  const session = await requireRole(["ADMIN"]);
  const { userId, from, to, timeZone } = payoutRangeSchema.parse(input);

  const [user, recipient] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, hourlyRate: true } }),
    prisma.wiseRecipient.findUnique({ where: { userId } }),
  ]);
  if (!user.hourlyRate) throw new Error(`${user.name} has no hourly rate set`);
  if (!recipient) throw new Error(`${user.name} hasn't added payout details yet`);

  const [entries, deductions] = await Promise.all([
    listTimeEntries({ userId, from, to }),
    listBreakDeductions({ userId, from, to }),
  ]);
  const rules: BreakDeductionRule[] = deductions.map((d) => ({
    userId: d.userId,
    fromDate: d.fromDate,
    toDate: d.toDate,
    minutesPerDay: d.minutesPerDay,
  }));
  const [totals] = summarizeByUser(entries, rules, timeZone || DEFAULT_TIMEZONE);
  const hours = totals?.hours ?? 0;
  if (hours <= 0) throw new Error("No completed sessions in this date range");

  const sourceAmount = Math.round(hours * user.hourlyRate * 100) / 100;
  const targetCurrency = recipient.currency;

  async function fail(step: string, error: unknown) {
    const message =
      error instanceof WiseConfigError
        ? "Wise isn't configured — ask an admin to set WISE_API_TOKEN / WISE_PROFILE_ID."
        : error instanceof WiseApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";
    await prisma.wiseTransaction.create({
      data: {
        userId,
        initiatedById: session.user.id,
        periodFrom: from,
        periodTo: to,
        hours,
        sourceCurrency: SOURCE_CURRENCY,
        sourceAmount,
        targetCurrency,
        targetAmount: 0,
        wiseQuoteId: "",
        status: "failed",
        failureReason: `${step}: ${message}`,
      },
    });
    throw new Error(`${step} failed: ${message}`);
  }

  let quote;
  try {
    quote = await createQuote({ sourceCurrency: SOURCE_CURRENCY, targetCurrency: recipient.currency, sourceAmount });
  } catch (error) {
    return fail("Getting a quote", error);
  }

  let transfer;
  try {
    transfer = await createTransfer({
      targetAccountId: recipient.wiseAccountId,
      quoteId: quote.id,
      reference: `Payroll ${from.toLocaleDateString()}-${to.toLocaleDateString()}`,
    });
  } catch (error) {
    return fail("Creating the transfer", error);
  }

  let status = transfer.status;
  try {
    const funded = await fundTransfer(transfer.id);
    status = funded.status;
    if (process.env.WISE_API_BASE?.includes("sandbox") || !process.env.WISE_API_BASE) {
      await simulateTransferCompletion(transfer.id);
      status = "outgoing_payment_sent";
    }
  } catch (error) {
    // The transfer exists at Wise even if funding failed — record what we
    // have rather than silently dropping a transaction Wise knows about.
    await prisma.wiseTransaction.create({
      data: {
        userId,
        initiatedById: session.user.id,
        periodFrom: from,
        periodTo: to,
        hours,
        sourceCurrency: SOURCE_CURRENCY,
        sourceAmount: quote.sourceAmount,
        targetCurrency: quote.targetCurrency,
        targetAmount: quote.targetAmount,
        wiseQuoteId: quote.id,
        wiseTransferId: String(transfer.id),
        status: "created",
        failureReason: `Funding failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
    throw new Error(`Transfer created but funding failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  const record = await prisma.wiseTransaction.create({
    data: {
      userId,
      initiatedById: session.user.id,
      periodFrom: from,
      periodTo: to,
      hours,
      sourceCurrency: SOURCE_CURRENCY,
      sourceAmount: quote.sourceAmount,
      targetCurrency: quote.targetCurrency,
      targetAmount: quote.targetAmount,
      wiseQuoteId: quote.id,
      wiseTransferId: String(transfer.id),
      status,
    },
  });

  await recordAudit({
    entityType: "WiseTransaction",
    entityId: record.id,
    action: "pay",
    actorId: session.user.id,
    field: "status",
    newValue: status,
  });

  revalidatePath("/time");
  return record;
}

export async function listWiseTransactions(limit = 25) {
  await requireRole(["ADMIN", "MANAGER"]);
  return prisma.wiseTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { name: true } },
      initiatedBy: { select: { name: true } },
    },
  });
}
