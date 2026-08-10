import { redirect } from "next/navigation";

// Middleware decides where you actually land: the queue if signed in, the login
// page if not. This just gets out of the way.
export default function Home() {
  redirect("/today");
}
