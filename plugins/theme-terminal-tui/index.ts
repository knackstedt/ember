export function activate(api: any) {
  api.registerTheme({
    id: "terminal-tui",
    name: "Terminal TUI",
    cssUrl: api.getAssetUrl("theme.css"),
    preview: "linear-gradient(135deg,#0c0c0c,#004400)",
    thumbnailUrl: api.getAssetUrl("thumbnail.svg"),
  });
}
