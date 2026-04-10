"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// In production this route is never hit — the whiteboard is embedded in a call
// and accessed directly via /room/[roomId] with the call's room ID.
// In development, redirect to a fixed test room so the UI is easy to preview.
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/room/dev-test");
  }, [router]);

  return null;
}
