import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { isPinEnabled, isUnlocked } from "@/lib/security";
import { lockNow } from "@/app/actions/security";

export const metadata: Metadata = {
  title: "Arsu Atelier",
  description: "Clients, measurements, orders and billing for Arsu Bespoke Studio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/orders", label: "Orders" },
  { href: "/clients", label: "Clients" },
  { href: "/daybook", label: "Day book" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /* REDIRECT, do not render the unlock screen in place.
   *
   * Rendering it here instead still executed the page underneath, and its
   * output went out in the streamed RSC payload — a locked /clients returned
   * the unlock screen with every client's name and phone number sitting in the
   * page source below it. Redirecting aborts the response before any of that
   * is sent.
   *
   * The path comes from middleware (see middleware.ts) because a layout is not
   * told its own route, and without it /unlock would redirect to itself. */
  const path = (await headers()).get("x-arsu-path") ?? "";
  const locked = isPinEnabled() && !(await isUnlocked());

  if (locked && path !== "/unlock") redirect("/unlock");

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="no-print border-b border-line bg-ink text-bone">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-serif text-xl tracking-[0.18em]">ARSU</span>
              <span className="text-xs tracking-wide text-bone/60">Atelier</span>
            </Link>

            <nav className="flex flex-wrap items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-bone/80 transition hover:bg-white/10 hover:text-bone"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {isPinEnabled() ? (
                <form action={lockNow}>
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-sm text-bone/60 transition hover:bg-white/10 hover:text-bone"
                    title="Lock this device"
                  >
                    Lock
                  </button>
                </form>
              ) : null}

              <Link
                href="/orders/new"
                className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110"
              >
                New order
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
