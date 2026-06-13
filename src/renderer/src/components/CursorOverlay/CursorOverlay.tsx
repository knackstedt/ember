import React, { useEffect, useState } from "react";
import { getCursorManager, DeviceCursor } from "../../hooks/browserControllerManager";
import { VirtualCursor } from "../VirtualCursor/VirtualCursor";

export const CursorOverlay: React.FC = () => {
  const [cursors, setCursors] = useState<DeviceCursor[]>([]);

  useEffect(() => {
    const manager = getCursorManager();
    setCursors(manager.cursors);
    return manager.subscribe(() => {
      setCursors(manager.cursors);
    });
  }, []);

  return (
    <>
      {cursors.map((cursor) => (
        <VirtualCursor
          key={cursor.deviceId}
          posRef={cursor.posRef}
          visible={cursor.visible}
          hoverStyle={cursor.hoverStyle}
          expanded={cursor.expanded}
          hue={cursor.hue}
          clickRef={cursor.clickRef}
        />
      ))}
    </>
  );
};
