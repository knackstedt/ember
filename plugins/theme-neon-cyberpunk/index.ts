export function activate(api: any) {
  api.registerTheme({
    id: "neon-cyberpunk",
    name: "Neon Cyberpunk",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#07070f,#ff2d78)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
