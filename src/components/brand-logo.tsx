import Image from "next/image";
import { cn } from "@/lib/utils";

// The Carenela logo (public/brand). Two files, one per theme: the wordmark is
// dark ink on light grounds and white on dark ones. Size it with a height
// class; the width follows.
export function BrandLogo({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  if (iconOnly) {
    return <Image src="/brand/carenela-icon.svg" alt="Carenela" width={512} height={512} unoptimized className={cn("h-8 w-auto", className)} />;
  }
  return (
    <>
      <Image src="/brand/carenela-logo.svg" alt="Carenela" width={504} height={100} unoptimized priority className={cn("h-8 w-auto dark:hidden", className)} />
      <Image src="/brand/carenela-logo-white.svg" alt="Carenela" width={504} height={100} unoptimized priority className={cn("hidden h-8 w-auto dark:block", className)} />
    </>
  );
}
