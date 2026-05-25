import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FileText,
  Maximize2,
  Minus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";
import type { ThemeMode } from "@/types";
import { isDirty } from "@/utils/files";

export function TitleBar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const saveActiveTab = useAppStore((state) => state.saveActiveTab);
  const saveActiveTabAs = useAppStore((state) => state.saveActiveTabAs);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeDirty = isDirty(activeTab);
  const appWindow = getCurrentWindow();

  const setMode = (mode: string) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      void setThemeMode(mode);
    }
  };

  return (
    <header className="grid h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-border bg-titlebar text-titlebar-foreground">
      <div className="flex h-full items-center gap-2 pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => void toggleSidebar()}
            >
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}</TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid size-6 place-items-center rounded bg-primary text-xs text-primary-foreground">
            B
          </div>
          <span className="text-xs tracking-wide text-muted-foreground">BNOTE</span>
        </div>
      </div>

      <div
        className="flex h-full min-w-0 items-center justify-center gap-2 px-3"
        data-tauri-drag-region
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" data-tauri-drag-region />
        <span
          className="truncate text-xs font-medium text-foreground"
          title={activeTab?.document.path}
          data-tauri-drag-region
        >
          {activeTab?.document.name ?? "No file open"}
          {activeDirty ? " *" : ""}
        </span>
      </div>

      <div className="flex h-full items-center">
        <ToggleGroup type="single" value={themeMode} onValueChange={setMode} className="mr-2 h-7">
          {(["dark", "light", "system"] satisfies ThemeMode[]).map((mode) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={mode} className="h-6 min-w-7 px-1.5">
                  {mode === "dark" ? <Moon className="size-3.5" /> : null}
                  {mode === "light" ? <Sun className="size-3.5" /> : null}
                  {mode === "system" ? <Settings2 className="size-3.5" /> : null}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{mode[0].toUpperCase() + mode.slice(1)} theme</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="mr-2 h-8 w-8 text-muted-foreground">
              <Settings2 />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>File</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void openFromDialog()}>Open</DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab || !activeDirty} onClick={() => void saveActiveTab()}>
              Save
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void saveActiveTabAs()}>Save As</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void toggleSidebar()}>
              {sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-5" />
        <Button
          size="titlebar"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void appWindow.minimize()}
        >
          <Minus className="size-4" />
        </Button>
        <Button
          size="titlebar"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void appWindow.toggleMaximize()}
        >
          <Maximize2 className="size-3.5" />
        </Button>
        <Button
          size="titlebar"
          variant="ghost"
          className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => void appWindow.close()}
        >
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}
