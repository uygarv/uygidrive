"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const themes = [
  ["light", SunIcon, "Light"],
  ["dark", MoonIcon, "Dark"],
  ["system", MonitorIcon, "System"],
];

export function ThemeMenu() {
  const { setTheme, resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsMounted(true));
    return () => window.clearTimeout(timer);
  }, []);
  const Icon = isMounted && resolvedTheme === "dark" ? MoonIcon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Change theme" />}>
        <Icon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {themes.map(([value, ThemeIcon, label]) => (
            <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
              <ThemeIcon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
