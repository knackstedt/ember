import React from "react";
import { DashboardWidget } from "../../../shared/types";
import {
  ClockWidget,
  SystemInfoWidget,
  RecentGamesWidget,
  FavoriteGamesWidget,
  StatsWidget,
  NowPlayingWidget,
  WebviewWidget,
  WeatherWidget,
  AchievementsWidget,
  RecentMoviesWidget,
  RecentMusicWidget,
  NewsWidget,
  QuickLaunchWidget,
} from "./widgets";

export const WidgetRenderer: React.FC<{
  widget: DashboardWidget;
  editMode?: boolean;
  onConfigChange?: (id: string, patch: Record<string, unknown>) => void;
}> = ({ widget, editMode, onConfigChange }) => {
  switch (widget.type) {
    case "clock":
      return <ClockWidget title={widget.title} format={(widget.config?.format as "12h" | "24h") ?? "24h"} showDate={widget.config?.showDate !== false} />;
    case "system-info":
      return <SystemInfoWidget title={widget.title} />;
    case "recent-games":
      return <RecentGamesWidget title={widget.title} maxItems={(widget.config?.maxItems as number) ?? 5} />;
    case "favorite-games":
      return <FavoriteGamesWidget title={widget.title} maxItems={(widget.config?.maxItems as number) ?? 5} />;
    case "stats":
      return <StatsWidget title={widget.title} />;
    case "now-playing":
      return <NowPlayingWidget title={widget.title} />;
    case "webview":
      return (
        <WebviewWidget
          title={widget.title}
          config={widget.config}
          editMode={editMode}
          onConfigChange={(patch) => onConfigChange?.(widget.id, patch)}
        />
      );
    case "weather":
      return <WeatherWidget title={widget.title} config={widget.config} />;
    case "achievements":
      return <AchievementsWidget title={widget.title} />;
    case "recent-movies":
      return <RecentMoviesWidget title={widget.title} maxItems={(widget.config?.maxItems as number) ?? 5} />;
    case "recent-music":
      return <RecentMusicWidget title={widget.title} maxItems={(widget.config?.maxItems as number) ?? 5} />;
    case "news":
      return <NewsWidget title={widget.title} />;
    case "quick-launch":
      return <QuickLaunchWidget title={widget.title} maxItems={(widget.config?.maxItems as number) ?? 6} />;
    default:
      return (
        <div className="flex items-center justify-center h-full text-sm opacity-40">
          Unknown widget: {widget.type}
        </div>
      );
  }
};
