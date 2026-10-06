import { useState } from "react";
import {
  Check,
  ChevronDown,
  Monitor,
  MoonStar,
  Sun,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { themes, useTheme } from "@/lib/theme";

const styles = {
  light: {
    title: "Light",
    Icon: Sun,
    surface: "#ffffff",
    text: "#20243a",
    accent: "#6849bc",
    soft: "#cbb6ff",
    success: "#176747",
    border: "#dfe2ee",
  },
  terminal: {
    title: "Terminal",
    Icon: Terminal,
    surface: "#111e18",
    text: "#e0f0e5",
    accent: "#80e4a2",
    soft: "#245637",
    success: "#97efb5",
    border: "#365243",
  },
  cyberpunk: {
    title: "Cyberpunk",
    Icon: Monitor,
    surface: "#141c2b",
    text: "#eef7ff",
    accent: "#64e7f0",
    soft: "#da6afa",
    success: "#8df4b5",
    border: "#35465d",
  },
  cosmic: {
    title: "Cosmic",
    Icon: MoonStar,
    surface: "#1c1b36",
    text: "#f2efff",
    accent: "#c7afff",
    soft: "#7568c9",
    success: "#9de5c7",
    border: "#443e65",
  },
};
export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const { Icon, title } = styles[theme];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Theme: ${title}`}
          title="Choose theme"
          className="h-11 w-11 px-0 text-primary sm:w-auto sm:px-3"
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">Theme</span>
          <ChevronDown className="hidden h-3 w-3 sm:block" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-64 max-w-[calc(100vw-1.5rem)] p-2"
        aria-label="Choose theme"
      >
        <p className="px-2 py-2 text-xs font-medium text-muted-foreground">
          Appearance
        </p>
        <div className="space-y-1" role="group" aria-label="Themes">
          {themes.map((value) => {
            const style = styles[value],
              OptionIcon = style.Icon;
            return (
              <button
                type="button"
                key={value}
                aria-label={`${style.title} theme`}
                aria-pressed={theme === value}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                style={{
                  background: style.surface,
                  color: style.text,
                  borderColor: theme === value ? style.accent : style.border,
                  fontFamily:
                    value === "terminal"
                      ? "'JetBrains Mono Variable', ui-monospace, monospace"
                      : "'Inter Variable', ui-sans-serif, sans-serif",
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <OptionIcon
                  className="h-4 w-4 shrink-0"
                  style={{ color: style.accent }}
                />
                <span>{style.title}</span>
                <span aria-hidden="true" className="ml-auto flex gap-1">
                  {[style.accent, style.soft, style.success].map((color) => (
                    <span
                      key={color}
                      className="h-2 w-2 rounded-full"
                      style={{ background: color }}
                    />
                  ))}
                </span>
                <span className="w-4">
                  {theme === value && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
