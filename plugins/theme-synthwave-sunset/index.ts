export function activate(api: any) {
  api.registerTheme({
    id: "synthwave-sunset",
    name: "Synthwave Sunset",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#0d0418,#2d1b4e)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
