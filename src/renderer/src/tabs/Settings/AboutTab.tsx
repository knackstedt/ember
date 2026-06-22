import React from "react";
import { motion } from "framer-motion";
import { Info, Copyright, ExternalLink, Heart } from "lucide-react";

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: "var(--color-accent)" }} />
        <h3 className="font-semibold" style={{ color: "var(--color-text)" }}>
          {title}
        </h3>
      </div>
      {children}
    </motion.section>
  );
}

const BUNDLED_DEPENDENCIES = [
  { name: "Electron", license: "MIT", url: "https://github.com/electron/electron" },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "React DOM", license: "MIT", url: "https://github.com/facebook/react" },
  { name: "Framer Motion", license: "MIT", url: "https://github.com/framer/motion" },
  { name: "Tailwind CSS", license: "MIT", url: "https://github.com/tailwindlabs/tailwindcss" },
  { name: "Zustand", license: "MIT", url: "https://github.com/pmndrs/zustand" },
  { name: "esbuild", license: "MIT", url: "https://github.com/evanw/esbuild" },
  { name: "source-map", license: "BSD-3-Clause", url: "https://github.com/mozilla/source-map" },
  { name: "Lucide React", license: "ISC", url: "https://github.com/lucide-icons/lucide" },
  { name: "Simple Icons", license: "CC0-1.0", url: "https://github.com/simple-icons/simple-icons" },
  { name: "Virtua", license: "MIT", url: "https://github.com/inokawa/virtua" },
  { name: "React Grid Layout", license: "MIT", url: "https://github.com/react-grid-layout/react-grid-layout" },
  { name: "Butterchurn", license: "MIT", url: "https://github.com/jberg/butterchurn" },
  { name: "Butterchurn Presets", license: "MIT", url: "https://github.com/jberg/butterchurn-presets" },
  { name: "Ruffle", license: "MIT / Apache-2.0", url: "https://github.com/ruffle-rs/ruffle" },
  { name: "SurrealDB", license: "BUSL-1.1", url: "https://github.com/surrealdb/surrealdb" },
  { name: "@surrealdb/node", license: "BUSL-1.1", url: "https://github.com/surrealdb/surrealdb.node" },
  { name: "@xenova/transformers", license: "Apache-2.0", url: "https://github.com/xenova/transformers.js" },
  { name: "jsnes", license: "MIT", url: "https://github.com/bfirsh/jsnes" },
  { name: "music-metadata", license: "MIT", url: "https://github.com/Borewit/music-metadata" },
  { name: "node-id3", license: "MIT", url: "https://github.com/Zazama/node-id3" },
  { name: "node-stream-zip", license: "MIT", url: "https://github.com/antelle/node-stream-zip" },
  { name: "multicast-dns", license: "MIT", url: "https://github.com/mafintosh/multicast-dns" },
  { name: "castv2", license: "MIT", url: "https://github.com/thibauts/node-castv2" },
  { name: "Matrix Animation", license: "MIT", url: "https://github.com/knackstedt/matrix-animation" },
];

const SYSTEM_DEPENDENCIES = [
  { name: "FFmpeg", license: "LGPL/GPL", url: "https://ffmpeg.org", note: "must be installed on the system" },
  { name: "GStreamer", license: "LGPL", url: "https://gstreamer.freedesktop.org", note: "must be installed on the system" },
  { name: "libmpv", license: "LGPL", url: "https://mpv.io", note: "must be installed on the system" },
  { name: "libretro", license: "Various", url: "https://www.libretro.com", note: "cores installed separately" },
  { name: "rclone", license: "MIT", url: "https://rclone.org", note: "must be installed on the system" },
];

export const AboutTab: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      {/* Application Info */}
      <SectionCard icon={Info} title="Ember">
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Ember is a Home Theater PC application built for the living room.
            It brings together local media, game emulation, and streaming into a single unified interface.
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Version 0.2.1 · Licensed under the PolyForm Noncommercial License 1.0.0
          </p>
          <a
            href="https://getember.tv"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm mt-1"
            style={{ color: "var(--color-accent)" }}
          >
            <ExternalLink size={14} />
            getember.tv
          </a>
          <a
            href="https://github.com/knackstedt/ember"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm mt-1"
            style={{ color: "var(--color-accent)" }}
          >
            <ExternalLink size={14} />
            github.com/knackstedt/ember
          </a>
        </div>
      </SectionCard>

      {/* Trademark Disclaimer */}
      <SectionCard icon={Copyright} title="Trademarks & Copyright">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            All product names, logos, brand identifiers, and icons displayed within Ember are the
            property of their respective copyright holders. This includes but is not limited to:
          </p>
          <ul className="list-disc list-inside text-sm" style={{ color: "var(--color-text-dim)" }}>
            <li>Game console and platform logos (Nintendo, Sony PlayStation, Microsoft Xbox, Sega, etc.)</li>
            <li>Game titles and their associated artwork</li>
            <li>Media company and streaming service logos</li>
            <li>Icons from the Simple Icons and Lucide icon libraries</li>
          </ul>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Use of these marks does not imply any affiliation with or endorsement by their respective owners.
            Ember is an independent project and is not sponsored, authorized, or affiliated with any of the
            aforementioned companies or organizations.
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Users are responsible for obtaining their own legally owned copies of games, firmware, and BIOS
            files required for emulation. Ember does not distribute copyrighted material.
          </p>
        </div>
      </SectionCard>

      {/* Open Source Dependencies */}
      <SectionCard icon={Heart} title="Open Source Dependencies">
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Ember is built on top of many excellent open-source projects. We are grateful to the
            communities and individuals who make this possible.
          </p>

          {/* Bundled */}
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Bundled with Ember
            </h4>
            <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              These libraries are shipped with the application.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {BUNDLED_DEPENDENCIES.map((dep: typeof BUNDLED_DEPENDENCIES[number]) => (
                <div
                  key={dep.name}
                  className="flex justify-between items-center text-sm py-1 border-b border-dashed"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <a
                    href={dep.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                    style={{ color: "var(--color-text)" }}
                  >
                    {dep.name}
                    <ExternalLink size={12} style={{ color: "var(--color-text-dim)" }} />
                  </a>
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-dim)" }}>
                    {dep.license}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* System / Runtime */}
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              System Runtime Dependencies
            </h4>
            <p className="text-xs" style={{ color: "var(--color-text-dim)" }}>
              These are installed on your system's package manager and Ember links to them dynamically at runtime. Ember provides installation helpers for them in the Dependencies tab.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {SYSTEM_DEPENDENCIES.map((dep: typeof SYSTEM_DEPENDENCIES[number]) => (
                <div
                  key={dep.name}
                  className="flex justify-between items-center text-sm py-1 border-b border-dashed"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <a
                    href={dep.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                    style={{ color: "var(--color-text)" }}
                  >
                    {dep.name}
                    <ExternalLink size={12} style={{ color: "var(--color-text-dim)" }} />
                  </a>
                  <span className="font-mono text-xs" style={{ color: "var(--color-text-dim)" }}>
                    {dep.license}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Warranty Disclaimer */}
      <SectionCard icon={Info} title="Disclaimer">
        <div className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Ember is provided "as is", without warranty of any kind, express or implied, including
            but not limited to the warranties of merchantability, fitness for a particular purpose,
            and noninfringement. In no event shall the authors or copyright holders be liable for any
            claim, damages, or other liability, whether in an action of contract, tort, or otherwise,
            arising from, out of, or in connection with the software or the use or other dealings
            in the software.
          </p>
        </div>
      </SectionCard>
    </div>
  );
};
