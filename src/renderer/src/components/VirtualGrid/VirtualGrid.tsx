import React, { useRef, CSSProperties } from 'react'
import { experimental_VGrid as VGrid, VGridHandle } from 'virtua'

export interface VirtualGridHandle {
  scrollToItem(index: number): void
}

interface VirtualGridProps<T> {
  items: T[]
  columnCount: number
  rowHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  style?: CSSProperties
  overscan?: number
}

export const VirtualGrid = React.forwardRef(function VirtualGridInner<T>(
  {
    items,
    columnCount,
    rowHeight,
    renderItem,
    className,
    style,
    overscan = 4
  }: VirtualGridProps<T>,
  forwardedRef: React.Ref<VirtualGridHandle>
): React.ReactElement {
  const ref = useRef<VGridHandle>(null)

  React.useImperativeHandle(forwardedRef, () => ({
    scrollToItem(index: number) {
      const row = Math.floor(index / columnCount)
      const col = index % columnCount
      ref.current?.scrollToIndex(col, row)
    }
  }), [columnCount])

  return (
    <VGrid
      ref={ref}
      className={`gpu-scroll ${className ?? ''}`}
      style={{ height: '100%', ...style }}
      row={Math.ceil(items.length / columnCount)}
      col={columnCount}
      cellHeight={rowHeight}
      overscan={overscan}
    >
      {({ rowIndex, colIndex }) => {
        const index = rowIndex * columnCount + colIndex
        if (index >= items.length) return <div />
        return <>{renderItem(items[index], index)}</>
      }}
    </VGrid>
  )
}) as <T>(props: VirtualGridProps<T> & { ref?: React.Ref<VirtualGridHandle> }) => React.ReactElement
