export function activate(api: any) {
  api.registerTheme({
    id: "deep-ocean",
    name: "Deep Ocean",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#001219,#003d4d)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
