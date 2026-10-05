import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const user = await getServerAuthSession();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
