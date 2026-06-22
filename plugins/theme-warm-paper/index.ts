export function activate(api: any) {
  api.registerTheme({
    id: "warm-paper",
    name: "Warm Paper",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#f4ecd8,#e3dcc6)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
