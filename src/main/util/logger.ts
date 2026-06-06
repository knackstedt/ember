import { execSync } from "node:child_process";

export interface Logger {
    trace(module: string, msg: string): void;
    debug(module: string, msg: string): void;
    info(module: string, msg: string): void;
    warn(module: string, msg: string): void;
    error(module: string, msg: string): void;
    fatal(module: string, msg: string): void;
}

const THEMES = {
    dark: {
        trace: "\x1b[38;2;69;197;139m",
        debug: "\x1b[38;2;82;148;226m",
        info: "\x1b[38;2;28;198;106m",
        warn: "\x1b[38;2;242;148;76m",
        error: "\x1b[38;2;255;110;110m",
        fatal: "\x1b[38;2;255;20;20m",
        module: "\x1b[38;2;82;148;226m",
        gray: "\x1b[38;2;128;128;128m",
        time: "\x1b[38;2;69;197;139m",
    },
    light: {
        trace: "\x1b[38;2;12;157;118m",
        debug: "\x1b[38;2;2;122;232m",
        info: "\x1b[38;2;12;157;118m",
        warn: "\x1b[38;2;201;111;5m",
        error: "\x1b[38;2;200;80;80m",
        fatal: "\x1b[38;2;255;20;20m",
        module: "\x1b[38;2;2;122;232m",
        gray: "\x1b[38;2;100;100;100m",
        time: "\x1b[38;2;12;157;118m",
    },
};

const reset = "\x1b[0m";
const bold = "\x1b[1m";

const OSC8_START = "\x1b]8;;";
const OSC8_END = "\x1b]8;;";
const BEL = "\x07";

function isPathLike(str: string): boolean {
    return (
        str.startsWith("http://") ||
        str.startsWith("https://") ||
        str.startsWith("/") ||
        str.startsWith("file://")
    );
}

function extractShorthand(pathOrUrl: string): string {
    const lineMatch = pathOrUrl.match(/(:\d+(?::\d+)?)$/);
    const lineSuffix = lineMatch ? lineMatch[1] : "";
    const withoutLine = lineSuffix
        ? pathOrUrl.slice(0, -lineSuffix.length)
        : pathOrUrl;

    try {
        const url = new URL(withoutLine);
        const parts = url.pathname.split("/").filter(Boolean);
        const filename = parts.pop() || url.pathname;
        return filename + lineSuffix;
    } catch {
        const parts = withoutLine.split(/[\\/]/).filter(Boolean);
        const filename = parts.pop() || withoutLine;
        return filename + lineSuffix;
    }
}

function makeTerminalLink(target: string, text: string): string {
    return `${OSC8_START}${target}${BEL}${text}${OSC8_END}${BEL}`;
}

function linkifyModule(module: string): string {
    if (!isPathLike(module)) return module;
    const shorthand = extractShorthand(module);
    const target = module.startsWith("/") ? `file://${module}` : module;
    return makeTerminalLink(target, shorthand);
}

function linkifyMessage(msg: string): string {
    msg = msg.replace(/https?:\/\/[^\s\)]+/g, (url) => {
        const shorthand = extractShorthand(url);
        return makeTerminalLink(url, shorthand);
    });

    msg = msg.replace(/\/(?:[^\s:)]+\/)+[^\s:)]+:\d+(?::\d+)?/g, (path) => {
        const shorthand = extractShorthand(path);
        return makeTerminalLink(`file://${path}`, shorthand);
    });

    return msg;
}

let _theme: "light" | "dark" | undefined;

function getTheme(): "light" | "dark" {
    if (_theme) return _theme;

    const colorfgbg = process.env.COLORFGBG;
    if (colorfgbg) {
        const parts = colorfgbg.split(";");
        if (parts.length > 1) {
            const bg = parseInt(parts[parts.length - 1]);
            if (bg >= 0 && bg <= 7) return (_theme = "dark");
            if (bg >= 8 && bg <= 15) return (_theme = "light");
        }
    }

    if (process.stdout?.isTTY) {
        try {
            const probe = `
                if [ -t 0 ]; then
                    stty -echo
                    printf "\\033]11;?\\007"
                    read -d $'\\a' -s -t 0.1 response
                    stty echo
                    echo $response
                fi
            `;
            const response = execSync(probe, {
                shell: "/bin/bash",
                stdio: ["inherit", "pipe", "ignore"],
            }).toString();
            if (response.includes("rgb:")) {
                const match = response.match(
                    /rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/
                );
                if (match) {
                    const r = parseInt(match[1], 16);
                    const g = parseInt(match[2], 16);
                    const b = parseInt(match[3], 16);
                    const brightness =
                        (r * 0.299 + g * 0.587 + b * 0.114) /
                        (Math.pow(16, match[1].length) - 1);
                    return (_theme = brightness > 0.5 ? "light" : "dark");
                }
            }
        } catch {
            // OSC 11 failed, continue to fallbacks
        }
    }

    if (process.platform === "darwin") {
        try {
            const style = execSync("defaults read -g AppleInterfaceStyle", {
                stdio: ["ignore", "pipe", "ignore"],
            })
                .toString()
                .trim();
            if (style === "Dark") return (_theme = "dark");
        } catch {
            return (_theme = "light");
        }
    } else if (process.platform === "linux") {
        try {
            const style = execSync(
                "gsettings get org.gnome.desktop.interface color-scheme",
                { stdio: ["ignore", "pipe", "ignore"] }
            )
                .toString()
                .trim()
                .replace(/'/g, "");
            if (style === "prefer-dark" || style.includes("dark"))
                return (_theme = "dark");
            if (style === "prefer-light" || style.includes("light"))
                return (_theme = "light");
        } catch {}

        try {
            const style = execSync(
                "dbus-send --session --print-reply=literal --dest=org.freedesktop.portal.Desktop /org/freedesktop/portal/desktop org.freedesktop.portal.Settings.Read string:'org.freedesktop.appearance' string:'color-scheme'",
                { stdio: ["ignore", "pipe", "ignore"] }
            ).toString();
            if (style.includes("uint32 1")) return (_theme = "dark");
            if (style.includes("uint32 2")) return (_theme = "light");
        } catch {}
    }

    return (_theme = "dark");
}

export class ConsoleLogger implements Logger {
    private readonly palette: (typeof THEMES)["dark"];

    constructor(private readonly level: number) {
        this.palette = THEMES[getTheme()];
    }

    private write(level: string, module: string, msg: string) {
        const color = (this.palette as any)[level];
        const timestamp = new Date().toTimeString().slice(0, 8);
        const linkedModule = linkifyModule(module);
        const moduleStr = isPathLike(module)
            ? linkedModule
            : `${this.palette.module}${module}`;
        process.stdout?.write(
            `${this.palette.time}${timestamp} ${color}${bold}${level.toUpperCase().padEnd(5)}${reset} ${this.palette.gray}[${moduleStr}${this.palette.gray}] ${reset}${linkifyMessage(msg)}\n`
        );
    }

    trace(module: string, msg: string) {
        this.level <= 1 && this.write("trace", module, msg);
    }

    debug(module: string, msg: string) {
        this.level <= 2 && this.write("debug", module, msg);
    }

    info(module: string, msg: string) {
        this.level <= 3 && this.write("info", module, msg);
    }

    warn(module: string, msg: string) {
        this.level <= 4 && this.write("warn", module, msg);
    }

    error(module: string, msg: string) {
        this.level <= 5 && this.write("error", module, msg);
    }

    fatal(module: string, msg: string) {
        this.level <= 6 && this.write("fatal", module, msg);
    }
}

const levelIntMap: Record<string, number> = {
    trace: 1,
    debug: 2,
    info: 3,
    warn: 4,
    error: 5,
    fatal: 6,
};

export function createLogger(
    level: "trace" | "debug" | "info" | "warn" | "error" | "fatal" =
        process.env.NODE_ENV === "test" ? "warn" : "info"
): Logger {
    return new ConsoleLogger(levelIntMap[level] ?? 3);
}
