import React from "react";
import {
  VirtualGrid,
  VirtualGridHandle,
  VirtualGridProps,
} from "../VirtualGrid/VirtualGrid";

export interface NeonGridViewProps<T> extends Omit<VirtualGridProps<T>, "ref"> {}

export const NeonGridView = React.forwardRef(function NeonGridViewInner<T>(
  props: NeonGridViewProps<T>,
  forwardedRef: React.Ref<VirtualGridHandle>,
): React.ReactElement {
  const { renderItem, ...rest } = props;

  const neonRenderItem = React.useCallback(
    (item: T, index: number) => {
      return (
        <div
          className="neon-grid-cell"
          style={{
            height: "100%",
            width: "100%",
            padding: 4,
          }}
        >
          <div
            className="neon-grid-border"
            style={{
              height: "100%",
              width: "100%",
              borderRadius: 3,
              overflow: "hidden",
              border: "1px solid rgba(24, 30, 46, 0.8)",
              background: "#04050e",
              transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
            }}
          >
            {renderItem(item, index)}
          </div>
        </div>
      );
    },
    [renderItem],
  );

  return (
    <VirtualGrid
      ref={forwardedRef}
      {...rest}
      renderItem={neonRenderItem}
    />
  );
}) as <T>(
  props: NeonGridViewProps<T> & { ref?: React.Ref<VirtualGridHandle> },
) => React.ReactElement;
