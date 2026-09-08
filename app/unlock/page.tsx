import { redirect } from "next/navigation";
import { getShop } from "@/lib/settings";
import { isPinEnabled, isUnlocked } from "@/lib/security";
import { UnlockScreen } from "@/components/unlock";

export const dynamic = "force-dynamic";

/* The one page that is never gated. Everything else redirects here when the
   shop PIN is on and this device has not been unlocked. */
export default async function UnlockPage() {
  if (!isPinEnabled() || (await isUnlocked())) redirect("/");

  return <UnlockScreen shopName={getShop().name} />;
}
