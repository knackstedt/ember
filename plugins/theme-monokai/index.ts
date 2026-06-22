export function activate(api: any) {
  api.registerTheme({
    id: "monokai",
    name: "Monokai",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#1e1e1e,#ffd866)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
