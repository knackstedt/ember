export function activate(api: any) {
  api.registerTheme({
    id: "glassmorphism",
    name: "Glassmorphism",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#0d1117,#1e3a5f)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
