"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Falha de renderização da loja", error.digest); }, [error]);
  return (
    <main className="grid min-h-screen place-items-center bg-obsidian p-6 text-center text-white">
      <div className="max-w-lg">
        <AlertTriangle className="mx-auto text-copper" size={42} />
        <h1 className="mt-6 font-display text-5xl uppercase">Algo saiu do ritmo.</h1>
        <p className="mt-4 text-sm leading-6 text-stone-400">Não foi possível carregar esta área agora. Nenhuma compra foi realizada.</p>
        <button className="button-primary mt-7" onClick={reset} type="button"><RefreshCw size={16} /> Tentar novamente</button>
      </div>
    </main>
  );
}
