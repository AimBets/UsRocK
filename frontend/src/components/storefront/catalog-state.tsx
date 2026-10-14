import { AlertTriangle, PackageOpen, RefreshCw } from "lucide-react";

export function CatalogState({ kind, message }: { kind: "empty" | "error"; message: string }) {
  const Icon = kind === "empty" ? PackageOpen : AlertTriangle;
  return (
    <div className="catalog-state" role={kind === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" size={32} strokeWidth={1.4} />
      <p>{message}</p>
      {kind === "error" && <a className="text-link" href=""><RefreshCw size={15} /> Tentar novamente</a>}
    </div>
  );
}
