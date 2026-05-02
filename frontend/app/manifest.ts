import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobRocket",
    short_name: "JobRocket",
    description: "AI-powered job application bot that applies to 50+ jobs daily",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb",
    theme_color: "#111827",
    categories: ["productivity", "business"],
    icons: [
      {
        src: "/globe.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        url: "/dashboard",
        description: "View your application stats",
      },
      {
        name: "Smart Scoring",
        url: "/scoring",
        description: "See scored jobs and insights",
      },
    ],
  };
}
