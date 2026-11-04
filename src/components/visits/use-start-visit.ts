"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clockIn } from "@/lib/actions/time-entries";
import { captureLocation, haversineMeters, formatDistance, NEAR_THRESHOLD_METERS } from "@/lib/geolocation";

export type StartableRecipient = { id: string; name: string; latitude: number | null; longitude: number | null };

/**
 * Clock in for a visit: capture GPS (never blocking), clock in, then tell
 * the Caregiver whether they're at the house. Shared by the header clock
 * and the Today page so both behave identically.
 */
export function useStartVisit() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function startVisit(recipient: StartableRecipient, onStarted?: () => void) {
    startTransition(async () => {
      try {
        const location = await captureLocation();
        await clockIn({ careRecipientId: recipient.id, ...location });
        onStarted?.();
        router.refresh();

        // Purely informational, never re-litigates the clock-in — only shown
        // when both the capture and the recipient's geocode exist.
        if (recipient.latitude != null && recipient.longitude != null && location.latitude != null && location.longitude != null) {
          const distance = haversineMeters(location.latitude, location.longitude, recipient.latitude, recipient.longitude);
          if (distance <= NEAR_THRESHOLD_METERS) {
            toast.success(`Visit started — you're at ${recipient.name}'s`);
          } else {
            toast.warning(`Visit started, but you're ${formatDistance(distance)} from ${recipient.name}'s address`);
          }
        } else if (location.locationError === "denied") {
          toast.success("Visit started", {
            description: "Location is off — turn it on in your browser so the office can confirm you're on site.",
          });
        } else {
          toast.success("Visit started");
        }
      } catch {
        toast.error("Couldn't start the visit — check your connection and try again");
      }
    });
  }

  return { startVisit, isPending };
}
