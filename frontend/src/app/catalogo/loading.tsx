export default function CatalogLoading() {
  return (
    <main className="min-h-screen bg-obsidian py-24 text-white" aria-busy="true" aria-label="Carregando catálogo">
      <div className="shell">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-6 h-20 max-w-2xl" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div className="skeleton aspect-[1/1.08]" key={item} />)}
        </div>
      </div>
    </main>
  );
}
