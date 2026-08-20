import { createFileRoute } from "@tanstack/react-router";

import LandingAlmore from "@/components/LandingAlmore";

// Sem head() aqui: título, descrição, canonical, Open Graph e dados
// estruturados vivem em __root.tsx, que é o único lugar onde o <head>
// é montado nesse scaffold.
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <LandingAlmore />;
}
