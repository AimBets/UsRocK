"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { authErrorMessage } from "@/lib/auth-errors";
import { useAuth } from "./auth-provider";

export function LogoutButton() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true); setError("");
    try {
      await signOut();
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage(cause, "Não foi possível encerrar a sessão."));
      setPending(false);
    }
  }

  return <div><button className="account-logout" disabled={pending} onClick={logout} type="button">{pending ? <LoaderCircle className="animate-spin" size={16} /> : <LogOut size={16} />} {pending ? "Saindo..." : "Sair da conta"}</button>{error && <p className="mt-2 text-xs text-red-300" role="alert">{error}</p>}</div>;
}
