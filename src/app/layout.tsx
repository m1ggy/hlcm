import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/components/auth/session-provider";
import { getHostOrg } from "@/lib/tenant";
import { PRODUCT_NAME } from "@/lib/branding";
import "./globals.css";

// Carenela type: Public Sans for the interface, Bricolage Grotesque for
// headings (font-heading), IBM Plex Mono for numbers in tables.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// The workspace's name in the browser tab, the product name outside one.
export async function generateMetadata(): Promise<Metadata> {
  const org = await getHostOrg();
  return {
    title: org?.status === "ACTIVE" ? `${org.name} · ${PRODUCT_NAME}` : PRODUCT_NAME,
    description: "The back office for care businesses",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${publicSans.variable} ${bricolage.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SessionProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
