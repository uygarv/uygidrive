"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  ariaLabel = "Slider",
  ...props
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Control data-slot="slider-control" className="flex w-full items-center py-2">
        <SliderPrimitive.Track data-slot="slider-track" className="relative h-1.5 w-full rounded-full bg-muted/70 dark:bg-input/35">
          <SliderPrimitive.Indicator data-slot="slider-indicator" className="absolute inset-y-0 left-0 rounded-full bg-primary" />
          <SliderPrimitive.Thumb aria-label={ariaLabel} data-slot="slider-thumb" className="block size-3.5 rounded-full border border-primary bg-background shadow-xs transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-dragging:scale-110" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
