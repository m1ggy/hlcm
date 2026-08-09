import { listWiseTransactions } from "@/lib/actions/wise";
import { formatDuration, formatMoney } from "@/lib/time-entries";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_VARIANT: Record<string, "default" | "outline" | "destructive"> = {
  outgoing_payment_sent: "default",
  processing: "outline",
  funds_converted: "outline",
  created: "outline",
  failed: "destructive",
};

export async function RecentPayouts() {
  const transactions = await listWiseTransactions();

  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No payouts sent yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.id}>
            <TableCell>{tx.createdAt.toLocaleDateString()}</TableCell>
            <TableCell className="font-medium">{tx.user.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {tx.periodFrom.toLocaleDateString()} – {tx.periodTo.toLocaleDateString()}
            </TableCell>
            <TableCell>{formatDuration(tx.hours)}</TableCell>
            <TableCell>
              {formatMoney(tx.sourceAmount)} {tx.sourceCurrency}
              {tx.targetCurrency !== tx.sourceCurrency &&
                ` → ${formatMoney(tx.targetAmount)} ${tx.targetCurrency}`}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[tx.status] ?? "outline"} title={tx.failureReason ?? undefined}>
                {tx.status.replaceAll("_", " ")}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
