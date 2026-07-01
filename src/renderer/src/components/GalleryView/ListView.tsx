import React, { useRef, CSSProperties, RefObject } from "react";
import { Virtualizer, VirtualizerHandle } from "virtua";

interface ListViewProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  rowHeight?: number;
  className?: string;
  style?: CSSProperties;
  scrollRef?: RefObject<HTMLElement>;
  overscan?: number;
}

export const ListView = React.forwardRef(function ListViewInner<T>(
  {
    items,
    renderItem,
    rowHeight = 80,
    className,
    style,
    scrollRef,
    overscan = 4,
  }: ListViewProps<T>,
  forwardedRef: React.Ref<{ scrollToItem(index: number): void }>,
): React.ReactElement {
  const virtualizerRef = useRef<VirtualizerHandle>(null);
  const renderItemRef = useRef(renderItem);
  renderItemRef.current = renderItem;

  React.useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToItem(index: number) {
        virtualizerRef.current?.scrollToIndex(index, { align: "nearest" });
      },
    }),
    [],
  );

  const containerStyle: CSSProperties = {
    ...style,
  };

  const rowStyle: CSSProperties = {
    height: rowHeight,
    borderBottom: "1px solid var(--border-default)",
  };

  const itemData = Array.from({ length: items.length }, (_, i) => i);

  if (scrollRef) {
    return (
      <div className={`w-full ${className ?? ""}`} style={containerStyle}>
        <Virtualizer
          ref={virtualizerRef}
          scrollRef={scrollRef}
          data={itemData}
          itemSize={rowHeight}
          bufferSize={overscan * rowHeight}
        >
          {(_, index) => (
            <div key={index} style={rowStyle} className="flex items-center">
              {renderItemRef.current(items[index], index)}
            </div>
          )}
        </Virtualizer>
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full overflow-y-auto gpu-scroll ${className ?? ""}`}
      style={containerStyle}
    >
      <Virtualizer
        ref={virtualizerRef}
        data={itemData}
        itemSize={rowHeight}
        bufferSize={overscan * rowHeight}
      >
        {(_, index) => (
          <div key={index} style={rowStyle} className="flex items-center">
            {renderItemRef.current(items[index], index)}
          </div>
        )}
      </Virtualizer>
    </div>
  );
}) as <T>(
  props: ListViewProps<T> & { ref?: React.Ref<{ scrollToItem(index: number): void }> },
) => React.ReactElement;
