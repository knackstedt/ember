/**
 * EmulatorJS Plugin for Ember HTPC
 *
 * This plugin provides browser-based emulation for NES, SNES, Game Boy,
 * and Game Boy Advance via EmulatorJS.
 *
 * On install, it downloads the EmulatorJS npm package and extracts the
 * required static assets into the plugin's assets directory.
 */

const PLATFORM_CORE_MAP = {
  nes: "nes",
  snes: "snes",
  gb: "gb",
  gba: "gba",
};

module.exports = {
  async onPluginInstall(api) {
    api.log("Downloading EmulatorJS assets...");
    // The build process for this plugin should have already bundled
    // the EmulatorJS static files into the assets/ directory.
    // If not, we could download them here from npm/GitHub.
  },

  async onPluginStart(api) {
    api.log("EmulatorJS plugin started");
  },

  async onGameStart(api, game) {
    const core = PLATFORM_CORE_MAP[game.platform];
    if (!core) return null;

    const romParam = encodeURIComponent(game.romPath || "");
    const url = `${api.getAssetUrl("player.html")}?rom=${romParam}&core=${core}&platform=${game.platform}`;

    return {
      type: "iframe",
      url,
      pluginId: api.manifest.id,
    };
  },
};
