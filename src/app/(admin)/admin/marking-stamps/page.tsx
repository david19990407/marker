import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/get-profile";

/** Legacy path — stamps now live under School settings. */
export default async function AdminMarkingStampsRedirectPage() {
  await requireProfile(["admin"]);
  redirect("/admin/settings/marking-stamps");
}
