import { redirect } from "next/navigation";

// Activation now lives directly on the home dashboard. Keep this route as a
// redirect so old links/bookmarks still land in the right place.
export default function ActivatePage() {
  redirect("/dashboard");
}
