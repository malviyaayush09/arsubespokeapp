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

/* THREE PLACES, not six.
 *
 * Dashboard, Orders, Day book and Reports were four destinations each
 * answering one question, and he had to know which one held the answer. His
 * day has three things in it: what is happening now, the jobs, and the
 * people. Day book and Reports move behind Today, which is where you look
 * when you want to know about today anyway.
 *
 * "Shop setup" rather than "Settings", and last: rates, what we stitch, what
 * we measure, backup, PIN, import. That screen is for whoever maintains this,
 * not for the man with a client waiting at the counter, and the name should
 * say so. */
const NAV = [
  { href: "/", label: "Today" },
  { href: "/orders", label: "Orders" },
  { href: "/clients", label: "Clients" },
];

/* Two quiet doors, and they are NOT the same kind of thing.
 *
 * Reports is read: the day book is his evening count, monthly figures are how
 * the shop is doing. Shop setup is configured - rates, the PIN, backup - and
 * then left alone for months. Filing them together put a screen that can
 * change a price next to one he opens most evenings. */
const ASIDE = [
  { href: "/daybook", label: "Reports" },
  { href: "/settings", label: "Shop setup" },
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
            <Link href="/" className="flex items-center gap-2.5">
              {/* The studio's monogram. A 135×160 source shown 28px tall, so it
                  only ever scales down — an upscaled logo is the quickest way
                  to make a thing look cheap. A plain <img> rather than
                  next/image: it is 25KB, local, and this app runs offline. */}
              <img
                src="/logo.png"
                alt=""
                width={135}
                height={160}
                className="h-7 w-auto"
              />
              <span className="flex items-baseline gap-2">
                <span className="font-serif text-xl tracking-[0.18em]">ARSU</span>
                <span className="text-xs tracking-wide text-bone/60">Atelier</span>
              </span>
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
              {/* Set apart from the three and quieter: destinations you go to
                  on purpose, not ones you pass through during a day's work. */}
              {ASIDE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-bone/50 transition hover:bg-white/10 hover:text-bone"
                >
                  {item.label}
                </Link>
              ))}

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
