export function activate(api: any) {
  api.registerTheme({
    id: "dark-oled",
    name: "Dark OLED",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "#000",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
