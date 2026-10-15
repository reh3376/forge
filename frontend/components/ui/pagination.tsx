import React from 'react'
import { Button } from './button'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  showPageNumbers?: boolean
  maxVisiblePages?: number
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showPageNumbers = true,
  maxVisiblePages = 5
}: PaginationProps) {
  if (totalPages <= 1) return null

  const getVisiblePages = () => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i)
    }

    const half = Math.floor(maxVisiblePages / 2)
    let start = Math.max(0, currentPage - half)
    const end = Math.min(totalPages - 1, start + maxVisiblePages - 1)

    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(0, end - maxVisiblePages + 1)
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }

  const visiblePages = getVisiblePages()
  const showStartEllipsis = visiblePages.length > 0 && visiblePages[0]! > 0
  const showEndEllipsis = visiblePages.length > 0 && visiblePages[visiblePages.length - 1]! < totalPages - 1

  return (
    <div className="flex items-center justify-center space-x-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        className="h-8 w-8 p-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {showPageNumbers && (
        <>
          {showStartEllipsis && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(0)}
                className="h-8 w-8 p-0"
              >
                1
              </Button>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </>
          )}

          {visiblePages.map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(page)}
              className="h-8 w-8 p-0"
            >
              {page + 1}
            </Button>
          ))}

          {showEndEllipsis && (
            <>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(totalPages - 1)}
                className="h-8 w-8 p-0"
              >
                {totalPages}
              </Button>
            </>
          )}
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages - 1}
        className="h-8 w-8 p-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

interface PaginationInfoProps {
  currentPage: number
  totalItems: number
  itemsPerPage: number
}

export function PaginationInfo({
  currentPage,
  totalItems,
  itemsPerPage
}: PaginationInfoProps) {
  const startItem = currentPage * itemsPerPage + 1
  const endItem = Math.min((currentPage + 1) * itemsPerPage, totalItems)

  return (
    <div className="text-sm text-muted-foreground">
      Showing {startItem} to {endItem} of {totalItems} recipes
    </div>
  )
}

interface PageSizeSelectorProps {
  pageSize: number
  onPageSizeChange: (size: number) => void
  options?: number[]
}

export function PageSizeSelector({
  pageSize,
  onPageSizeChange,
  options = [10, 20, 50, 100]
}: PageSizeSelectorProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-muted-foreground">Show</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        className="border rounded px-2 py-1 text-sm bg-background text-foreground border-input focus:ring-2 focus:ring-ring focus:border-transparent"
        aria-label="Items per page"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground">per page</span>
    </div>
  )
} 