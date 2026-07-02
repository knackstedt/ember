import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettingsStore } from "../../store/settings.store";
import { KeybindEditor } from "../../components/KeybindEditor/KeybindEditor";
import { Switch } from "../../components/Switch/Switch";
import { Keyboard, Gamepad2, AlertCircle, Info, Mouse, Globe, Sliders, Bluetooth, RefreshCw, Power, Trash2, Link2, Unlink, Search, Battery, Activity } from "lucide-react";
import { BluetoothDevice, BluetoothAdapterState } from "../../../../shared/types";

export const InputTab: React.FC = () => {
  const { settings, update } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<"keyboard" | "controller" | "browser" | "bluetooth">("keyboard");

  if (!settings) return null;

  // Check for overmapping (same key mapped to multiple commands)
  const overmappedKeys = useMemo(() => {
    const keybinds = settings.commandKeybinds ?? {};
    const keyToCommands: Record<string, string[]> = {};

    Object.entries(keybinds).forEach(([cmdId, shortcut]) => {
      if (!shortcut) return;
      if (!keyToCommands[shortcut]) {
        keyToCommands[shortcut] = [];
      }
      keyToCommands[shortcut].push(cmdId);
    });

    return Object.entries(keyToCommands)
      .filter(([_, cmdIds]) => cmdIds.length > 1)
      .map(([key, cmdIds]) => ({ key, cmdIds }));
  }, [settings.commandKeybinds]);

  // Check for overmapped controller buttons
  const overmappedButtons = useMemo(() => {
    const controllerMap = settings.commandControllerMap ?? {};
    const buttonToCommands: Record<string, string[]> = {};

    Object.entries(controllerMap).forEach(([cmdId, button]) => {
      if (!button) return;
      if (!buttonToCommands[button]) {
        buttonToCommands[button] = [];
      }
      buttonToCommands[button].push(cmdId);
    });

    return Object.entries(buttonToCommands)
      .filter(([_, cmdIds]) => cmdIds.length > 1)
      .map(([button, cmdIds]) => ({ button, cmdIds }));
  }, [settings.commandControllerMap]);

  const hasOvermapping = overmappedKeys.length > 0 || overmappedButtons.length > 0;

  // Memoize callbacks to prevent effect re-runs during keybind recording
  const handleChangeKeybind = useCallback((cmdId: string, shortcut: string | undefined) => {
    const next = { ...(settings.commandKeybinds ?? {}) };
    if (shortcut) next[cmdId] = shortcut;
    else delete next[cmdId];
    update({ commandKeybinds: next });
  }, [settings.commandKeybinds, update]);

  const handleChangeController = useCallback((cmdId: string, button: string | undefined) => {
    const next = { ...(settings.commandControllerMap ?? {}) };
    if (button) next[cmdId] = button;
    else delete next[cmdId];
    update({ commandControllerMap: next });
  }, [settings.commandControllerMap, update]);

  const handleResetAll = useCallback(() => {
    update({ commandKeybinds: {}, commandControllerMap: {} });
  }, [update]);

  const handleBrowserSettingChange = useCallback((key: keyof NonNullable<typeof settings.controllerBrowser>, value: any) => {
    const current = settings.controllerBrowser ?? {
      snapToElement: true,
      snapDistance: 50,
      snapSelectors: ["button", "a", "input", "textarea", "select", "[role='button']"],
      mouseSpeed: 0.5,
      swapRightStickAxes: false,
      buttonRemapping: {},
    };
    update({
      controllerBrowser: {
        ...current,
        [key]: value,
      },
    });
  }, [settings, update]);

  return (
    <div className="flex flex-col gap-6">
      {/* Section Tabs */}
      <section className="flex flex-col gap-4" data-nav-orientation="horizontal">
        <div className="flex gap-2 p-1 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
          <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "keyboard" ? "var(--accent)" : "transparent",
            color: activeSection === "keyboard" ? "var(--surface-base)" : "var(--text-primary)",
          }}
          onClick={() => setActiveSection("keyboard")}
          whileTap={{ scale: 0.98 }}
        >
          <Keyboard size={16} />
          Keyboard
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "controller" ? "var(--accent)" : "transparent",
            color: activeSection === "controller" ? "var(--surface-base)" : "var(--text-primary)",
          }}
          onClick={() => setActiveSection("controller")}
          whileTap={{ scale: 0.98 }}
        >
          <Gamepad2 size={16} />
          Controller
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "browser" ? "var(--accent)" : "transparent",
            color: activeSection === "browser" ? "var(--surface-base)" : "var(--text-primary)",
          }}
          onClick={() => setActiveSection("browser")}
          whileTap={{ scale: 0.98 }}
        >
          <Globe size={16} />
          Browser
        </motion.button>
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-card)] text-sm font-medium transition-colors"
          style={{
            background: activeSection === "bluetooth" ? "var(--accent)" : "transparent",
            color: activeSection === "bluetooth" ? "var(--surface-base)" : "var(--text-primary)",
          }}
          onClick={() => setActiveSection("bluetooth")}
          whileTap={{ scale: 0.98 }}
        >
          <Bluetooth size={16} />
          Bluetooth
        </motion.button>
      </div>
      </section>

      {/* Overmapping Warnings */}
      <AnimatePresence>
        {hasOvermapping && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-2 p-4 rounded-[var(--radius-card)]"
            style={{
              background: "color-mix(in srgb, #ff4444 15%, var(--surface-1))",
              border: "1px solid #ff444430",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={18} style={{ color: "#ff4444" }} />
              <span className="font-medium" style={{ color: "#ff6666" }}>
                Overmapping Detected
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Multiple commands are mapped to the same {overmappedKeys.length > 0 && overmappedButtons.length > 0 ? "keys and buttons" : overmappedKeys.length > 0 ? "keys" : "buttons"}. This may cause unexpected behavior.
            </p>
            {overmappedKeys.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {overmappedKeys.map(({ key, cmdIds }) => (
                  <div key={key} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface-0)" }}>{key}</span>
                    {" → "}
                    {cmdIds.length} commands
                  </div>
                ))}
              </div>
            )}
            {overmappedButtons.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {overmappedButtons.map(({ button, cmdIds }) => (
                  <div key={button} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--surface-0)" }}>{button}</span>
                    {" → "}
                    {cmdIds.length} commands
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Box */}
      <div className="flex items-start gap-3 p-3 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
        <Info size={16} style={{ color: "var(--accent)", marginTop: 2 }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Click a shortcut to record a new keyboard combination. Press <kbd className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: "var(--surface-0)" }}>Escape</kbd> to cancel recording.
          For controller, click the button column to assign or change a gamepad button.
        </p>
      </div>

      {/* Keybind Editor */}
      {activeSection !== "browser" && activeSection !== "bluetooth" && (
        <section className="flex flex-col gap-4">
          <KeybindEditor
            keybinds={settings.commandKeybinds ?? {}}
            controllerMap={settings.commandControllerMap ?? {}}
            activeTab={activeSection}
            onChangeKeybind={handleChangeKeybind}
            onChangeController={handleChangeController}
            onResetAll={handleResetAll}
          />
        </section>
      )}

      {/* Browser Controller Settings */}
      {activeSection === "browser" && (
        <section className="flex flex-col gap-6">
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
            <Info size={16} style={{ color: "var(--accent)", marginTop: 2 }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Configure controller navigation for web browsers (Store tab). Right stick moves mouse, A/RT left click, X/LT right click, B back, Y forward, left stick scroll, D-pad arrows, bumpers tab navigation.
            </p>
          </div>

          {/* Snap to Element */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Mouse size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Snap to Element
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.controllerBrowser?.snapToElement ?? true}
                onChange={(v) => handleBrowserSettingChange("snapToElement", v)}
                label="Enable snap-to-element on left click"
              />
            </div>
          </div>

          {/* Snap Distance */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sliders size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Snap Distance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="10"
                max="200"
                step="10"
                value={settings.controllerBrowser?.snapDistance ?? 50}
                onChange={(e) => handleBrowserSettingChange("snapDistance", parseInt(e.target.value))}
                className="flex-1 h-2 rounded-lg cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm w-12 text-right" style={{ color: "var(--text-secondary)" }}>
                {settings.controllerBrowser?.snapDistance ?? 50}px
              </span>
            </div>
          </div>

          {/* Mouse Speed */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Gamepad2 size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Mouse Speed
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={settings.controllerBrowser?.mouseSpeed ?? 0.5}
                onChange={(e) => handleBrowserSettingChange("mouseSpeed", parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-lg cursor-pointer"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm w-12 text-right" style={{ color: "var(--text-secondary)" }}>
                {settings.controllerBrowser?.mouseSpeed ?? 0.5}x
              </span>
            </div>
          </div>

          {/* Swap Right Stick Axes */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Gamepad2 size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Right Stick Axis Mapping
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.controllerBrowser?.swapRightStickAxes ?? false}
                onChange={(v) => handleBrowserSettingChange("swapRightStickAxes", v)}
                label="Swap axes (try this if cursor moves wrong direction)"
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Default: axis 2 = horizontal, axis 3 = vertical. Enable to swap to axis 3 = horizontal, axis 2 = vertical.
            </p>
          </div>

          {/* Snap Selectors */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Globe size={16} style={{ color: "var(--accent)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Snap CSS Selectors
              </span>
            </div>
            <textarea
              value={(settings.controllerBrowser?.snapSelectors ?? ["button", "a", "input", "textarea", "select", "[role='button']"]).join("\n")}
              onChange={(e) => {
                const selectors = e.target.value.split("\n").filter(s => s.trim());
                handleBrowserSettingChange("snapSelectors", selectors);
              }}
              placeholder="button&#10;a&#10;input&#10;textarea&#10;select&#10;[role='button']"
              className="w-full p-3 rounded-[var(--radius-card)] text-sm font-mono resize-none"
              style={{
                background: "var(--surface-0)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                minHeight: "120px",
              }}
              rows={6}
            />
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              CSS selectors for elements to snap to (one per line)
            </p>
          </div>
        </section>
      )}

      {/* Bluetooth Settings */}
      {activeSection === "bluetooth" && (
        <BluetoothSection />
      )}
    </div>
  );
};

function BluetoothSection() {
  const [available, setAvailable] = useState(false);
  const [adapter, setAdapter] = useState<BluetoothAdapterState | null>(null);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const avail = await window.htpc.bluetooth.available();
    setAvailable(avail);
    if (avail) {
      const [ad, devs] = await Promise.all([
        window.htpc.bluetooth.adapter(),
        window.htpc.bluetooth.devices(),
      ]);
      setAdapter(ad);
      setDevices(devs);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePower = useCallback(async (on: boolean) => {
    setBusy("power");
    setError(null);
    const ok = await window.htpc.bluetooth.setPower(on);
    if (!ok) setError(`Failed to power ${on ? "on" : "off"} adapter`);
    await refresh();
    setBusy(null);
  }, [refresh]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const found = await window.htpc.bluetooth.scan(10);
      setDevices(found);
    } catch {
      setError("Scan failed");
    }
    setScanning(false);
  }, []);

  const handleAction = useCallback(async (
    action: string,
    mac: string,
    fn: (mac: string) => Promise<boolean>,
  ) => {
    setBusy(`${action}:${mac}`);
    setError(null);
    const ok = await fn(mac);
    if (!ok) setError(`${action} failed for ${mac}`);
    await refresh();
    setBusy(null);
  }, [refresh]);

  if (!available) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex items-start gap-3 p-3 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
          <AlertCircle size={16} style={{ color: "#ff9800", marginTop: 2 }} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Bluetooth Not Available
            </span>
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              bluetoothctl was not found. Install BlueZ to use Bluetooth controller pairing.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Adapter status */}
      <div className="flex flex-col gap-3 p-4 rounded-[var(--radius-card)]" style={{ background: "var(--surface-1)" }}>
        <div className="flex items-center gap-2">
          <Bluetooth size={18} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Bluetooth Adapter
          </span>
        </div>
        {adapter && (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {adapter.name || "Unknown"}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "var(--surface-0)", color: "var(--text-secondary)" }}>
              {adapter.address}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: adapter.powered ? "#4ade80" : "var(--text-secondary)" }}>
                {adapter.powered ? "Powered On" : "Powered Off"}
              </span>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePower(!adapter.powered)}
                disabled={busy === "power"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  background: adapter.powered ? "#ff444420" : "var(--accent)",
                  color: adapter.powered ? "#ff6666" : "var(--surface-base)",
                  border: `1px solid ${adapter.powered ? "#ff444440" : "var(--accent)"}`,
                }}
              >
                <Power size={14} />
                {adapter.powered ? "Power Off" : "Power On"}
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* Scan button */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleScan}
          disabled={scanning || !adapter?.powered}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium"
          style={{
            background: scanning ? "var(--surface-1)" : "var(--accent)",
            color: scanning ? "var(--text-secondary)" : "var(--surface-base)",
            border: `1px solid ${scanning ? "var(--border-default)" : "var(--accent)"}`,
            opacity: (!adapter?.powered || scanning) ? 0.6 : 1,
          }}
        >
          {scanning ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Search size={16} />
              Scan for Devices
            </>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 rounded text-sm"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </motion.button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-card)]" style={{ background: "color-mix(in srgb, #ff4444 15%, var(--surface-1))", border: "1px solid #ff444430" }}>
          <AlertCircle size={16} style={{ color: "#ff4444" }} />
          <span className="text-sm" style={{ color: "#ff6666" }}>{error}</span>
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 ? (
        <div className="flex flex-col gap-2">
          {devices.map((dev) => (
            <div
              key={dev.mac}
              className="flex items-center gap-3 p-3 rounded-[var(--radius-card)]"
              style={{
                background: "var(--surface-1)",
                border: dev.connected ? "1px solid #4ade8040" : "1px solid var(--border-default)",
              }}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                    {dev.name}
                  </span>
                  {dev.connected && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#4ade8020", color: "#4ade80" }}>
                      Connected
                    </span>
                  )}
                  {dev.paired && !dev.connected && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--surface-0)", color: "var(--text-secondary)" }}>
                      Paired
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span className="font-mono">{dev.mac}</span>
                  {dev.icon && <span>{dev.icon}</span>}
                  {dev.rssiPercent !== undefined && (
                    <span className="flex items-center gap-1">
                      <Activity size={12} /> {dev.rssiPercent}%
                    </span>
                  )}
                  {dev.batteryPercent !== undefined && (
                    <span className="flex items-center gap-1">
                      <Battery size={12} /> {dev.batteryPercent}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {!dev.paired && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAction("pair", dev.mac, window.htpc.bluetooth.pair)}
                    disabled={busy === `pair:${dev.mac}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                    style={{ background: "var(--accent)", color: "var(--surface-base)" }}
                  >
                    <Link2 size={14} /> Pair
                  </motion.button>
                )}
                {dev.paired && !dev.connected && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAction("connect", dev.mac, window.htpc.bluetooth.connect)}
                    disabled={busy === `connect:${dev.mac}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                    style={{ background: "#4ade80", color: "#000" }}
                  >
                    <Link2 size={14} /> Connect
                  </motion.button>
                )}
                {dev.connected && (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAction("reconnect", dev.mac, window.htpc.bluetooth.reconnect)}
                      disabled={busy === `reconnect:${dev.mac}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                      style={{ background: "var(--surface-0)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
                    >
                      <RefreshCw size={14} /> Reconnect
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAction("disconnect", dev.mac, window.htpc.bluetooth.disconnect)}
                      disabled={busy === `disconnect:${dev.mac}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium"
                      style={{ background: "#ff444420", color: "#ff6666", border: "1px solid #ff444440" }}
                    >
                      <Unlink size={14} /> Disconnect
                    </motion.button>
                  </>
                )}
                {dev.paired && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAction("remove", dev.mac, window.htpc.bluetooth.remove)}
                    disabled={busy === `remove:${dev.mac}`}
                    className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium"
                    style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                    title="Forget device"
                  >
                    <Trash2 size={14} /> Forget
                  </motion.button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-60">
          <Bluetooth size={32} />
          <span className="text-sm">No Bluetooth devices found. Click "Scan for Devices" to search.</span>
        </div>
      )}
    </section>
  );
}
