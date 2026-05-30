import React, { useRef, CSSProperties } from 'react'
import { experimental_VGrid as VGrid, VGridHandle } from 'virtua'

interface VirtualGridProps<T> {
  items: T[]
  columnCount: number
  rowHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  style?: CSSProperties
  overscan?: number
}

export function VirtualGrid<T>({
  items,
  columnCount,
  rowHeight,
  renderItem,
  className,
  style,
  overscan = 4
}: VirtualGridProps<T>): React.ReactElement {
  const ref = useRef<VGridHandle>(null)

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
}
