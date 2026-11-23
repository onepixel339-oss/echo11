import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ECHO — Your taste, mapped.",
    short_name: "ECHO",
    id: "/",
    description:
      "Local-first taste atlas: your anime, movies, series, games and books as an explorable map with explainable recommendations.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07090d",
    theme_color: "#0a0d12",
    orientation: "portrait-primary",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
