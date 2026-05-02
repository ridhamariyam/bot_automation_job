const COLORS: Record<string, string> = {
  linkedin:    "#0077B5",
  indeed:      "#003A9B",
  glassdoor:   "#0CAA41",
  monster:     "#6B0FAC",
  google_jobs: "#EA4335",
  naukri:      "#FF7555",
  bayt:        "#005BAC",
  timesjobs:   "#E83030",
};

const ICONS: Record<string, string> = {
  linkedin:    "in",
  indeed:      "II",
  glassdoor:   "GD",
  monster:     "M",
  google_jobs: "G",
  naukri:      "N",
  bayt:        "B",
  timesjobs:   "TJ",
};

export function platformColor(platform: string): string {
  return COLORS[platform.toLowerCase()] ?? "#6b7280";
}

export function platformIcon(platform: string): string {
  return ICONS[platform.toLowerCase()] ?? platform[0]?.toUpperCase() ?? "?";
}

export function platformLabel(platform: string): string {
  return platform.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
