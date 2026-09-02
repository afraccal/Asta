import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Il listone ufficiale pesa ~70KB, ma un file con le immagini o una
    // stagione intera puo' crescere: il limite predefinito (1MB) sta stretto.
    serverActions: { bodySizeLimit: "8mb" },
  },
  images: {
    // Predisposizione per le foto dei giocatori servite da un CDN esterno
    // (§4): aggiungere qui il dominio, senza toccare i componenti.
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
};

export default nextConfig;
