import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { StorefrontProvider } from "@/components/storefront/storefront-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UsRock — Vista o seu som",
  description: "Moda autoral inspirada pela força do rock, do metal e da cultura alternativa.",
  openGraph: {
    title: "UsRock — Vista o seu som",
    description: "Moda autoral para quem carrega a atitude para além da música.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
        <AuthProvider><StorefrontProvider>{children}</StorefrontProvider></AuthProvider>
      </body>
    </html>
  );
}
