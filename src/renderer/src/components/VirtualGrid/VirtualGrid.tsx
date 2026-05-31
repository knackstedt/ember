import React, { useRef, useState, useEffect, CSSProperties } from 'react'
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

const GridCell = React.forwardRef<HTMLDivElement, { style: CSSProperties; children: React.ReactNode }>(
  function GridCellInner({ style, children }, ref) {
    return (
      <div
        ref={ref}
        style={{
          ...style,
          width: style.minWidth,
          height: style.minHeight,
          display: 'flex',
        }}
      >
        {children}
      </div>
    )
  }
)

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
  const containerRef = useRef<HTMLDivElement>(null)
  const [cellWidth, setCellWidth] = useState(200)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) {
          setCellWidth(Math.floor(w / columnCount))
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [columnCount])

  React.useImperativeHandle(forwardedRef, () => ({
    scrollToItem(index: number) {
      const row = Math.floor(index / columnCount)
      const col = index % columnCount
      ref.current?.scrollToIndex(col, row)
    }
  }), [columnCount])

  return (
    <div ref={containerRef} className="w-full h-full">
      <VGrid
        key={`${columnCount}-${cellWidth}`}
        ref={ref}
        className={`gpu-scroll ${className ?? ''}`}
        style={{ height: '100%', width: '100%', ...style }}
        item={GridCell}
        row={Math.ceil(items.length / columnCount)}
        col={columnCount}
        cellHeight={rowHeight}
        cellWidth={cellWidth}
        overscan={overscan}
      >
        {({ rowIndex, colIndex }) => {
          const index = rowIndex * columnCount + colIndex
          if (index >= items.length) {
            return <div className="w-full h-full" />
          }
          return (
            <div className="w-full h-full min-w-0 overflow-hidden">
              {renderItem(items[index], index)}
            </div>
          )
        }}
      </VGrid>
    </div>
  )
}) as <T>(props: VirtualGridProps<T> & { ref?: React.Ref<VirtualGridHandle> }) => React.ReactElement
