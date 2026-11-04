import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMyPayments } from "@/lib/actions/payroll";
import { MyPayList } from "@/components/payroll/my-pay-list";

/** "My Pay" on /time and /hours — hidden until the person has been paid
 * through Payroll at least once. `id="my-pay"` is the notification link target. */
export async function MyPayCard() {
  const payments = await listMyPayments();
  if (payments.length === 0) return null;
  return (
    <Card id="my-pay" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>My Pay</CardTitle>
        <CardDescription>Payments the office has sent you. Please confirm each one once it arrives.</CardDescription>
      </CardHeader>
      <CardContent>
        <MyPayList payments={payments} />
      </CardContent>
    </Card>
  );
}
