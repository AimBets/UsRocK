import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export function AccountShell({ eyebrow, title, intro, children, note }: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div>
      <AnnouncementBar />
      <Header />
      <main className="account-stage" id="conteudo">
        <div className="account-grid shell">
          <section className="account-editorial">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
            <div className="account-rule" aria-hidden="true"><span>USR</span><span>ACCOUNT</span><span>EST. 2026</span></div>
            {note && <div className="account-note">{note}</div>}
          </section>
          <section className="account-panel">{children}</section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
