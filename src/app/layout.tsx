import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA_INIZIALE } from "@/lib/tema";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Condensata e pesante: nomi e crediti devono leggersi da lontano, su una TV.
const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Asta Fantacalcio",
  description: "La sala d'asta virtuale per il fantacalcio tra amici.",
};

export const viewport: Viewport = {
  themeColor: "#070A11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      // Lo script qui sotto scrive data-tema prima dell'idratazione, quindi
      // il markup del client differisce da quello del server per costruzione:
      // e' voluto, ed e' il modo standard di evitare il lampo del tema
      // sbagliato. Senza questa riga React segnala un disallineamento.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        {/* Applica il tema salvato prima del disegno: senza, a ogni
            caricamento si vedrebbe un lampo del tema sbagliato. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INIZIALE }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
