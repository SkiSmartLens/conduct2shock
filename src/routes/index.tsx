import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const Game = lazy(() => import("@/components/Game"));

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  // The game needs WebGL and the window, so it only renders on the client.
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);
  if (!client) return <div className="menu" />;
  return (
    <Suspense fallback={<div className="menu" />}>
      <Game />
    </Suspense>
  );
}
