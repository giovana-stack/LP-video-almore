import { createFileRoute } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <div className="p-8">
      <p className="whitespace-pre-wrap">
        Execute esta instrucao no projeto: Crie um projeto React + Vite + TypeScript com uma única página, sem
        Tailwind, sem biblioteca de componentes e sem roteador. A página inteira
        virá de um componente que eu vou colar. Não gere nenhum design.
      </p>
    </div>
  );
}
