import { redirect } from "next/navigation";

// Middleware decides where you actually land: dashboard if signed in,
// login if not. This just gets out of the way.
export default function Home() {
  redirect("/dashboard");
}
