import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

function Breadcrumb({
  className,
  ...props
}) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn(className)}
      {...props} />
  );
}

function BreadcrumbList({
  className,
  ...props
}) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground",
        className
      )}
      {...props} />
  );
}

function BreadcrumbItem({
  className,
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "li",
    props: {
      className: cn("inline-flex shrink-0 items-center", className),
      ...props,
    },
    render,
    state: {
      slot: "breadcrumb-item",
    },
  });
}

function BreadcrumbLink({
  className,
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps({
      className: cn("transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className),
    }, props),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  });
}

function BreadcrumbPage({
  className,
  ...props
}) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props} />
  );
}

function BreadcrumbSeparator({
  children,
  className,
  render,
  ...props
}) {
  return useRender({
    defaultTagName: "li",
    props: {
      role: "presentation",
      "aria-hidden": true,
      children: children ?? <ChevronRightIcon />,
      className: cn("flex size-7 shrink-0 items-center justify-center text-muted-foreground/70 [&>svg]:size-4", className),
      ...props,
    },
    render,
    state: {
      slot: "breadcrumb-separator",
    },
  });
}

function BreadcrumbEllipsis({
  className,
  ...props
}) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}>
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
