import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ClipboardCopy,
  FilePlus2,
  Folder,
  FileText,
  Focus,
  Info,
  ListTree,
  Maximize2,
  Menu,
  Minus,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";
import type { ThemeMode } from "@/types";
import { isDirty, isFilesystemDocument, isUntitledDocument } from "@/utils/files";

export function TitleBar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const documentOutlineCollapsed = useAppStore((state) => state.documentOutlineCollapsed);
  const tabs = useAppStore((state) => state.tabs);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
  const editorSettings = useAppStore((state) => state.editorSettings);
  const zenMode = useAppStore((state) => state.zenMode);
  const createNewFile = useAppStore((state) => state.createNewFile);
  const toggleDocumentOutline = useAppStore((state) => state.toggleDocumentOutline);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const toggleZenMode = useAppStore((state) => state.toggleZenMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setEditorFontSize = useAppStore((state) => state.setEditorFontSize);
  const setEditorTabSize = useAppStore((state) => state.setEditorTabSize);
  const setShowLineNumbers = useAppStore((state) => state.setShowLineNumbers);
  const setWordWrap = useAppStore((state) => state.setWordWrap);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const openFolderFromDialog = useAppStore((state) => state.openFolderFromDialog);
  const saveActiveTab = useAppStore((state) => state.saveActiveTab);
  const saveActiveTabAs = useAppStore((state) => state.saveActiveTabAs);
  const copyActiveFileInfo = useAppStore((state) => state.copyActiveFileInfo);
  const copyActivePath = useAppStore((state) => state.copyActivePath);
  const showSystemInfo = useAppStore((state) => state.showSystemInfo);
  const checkForUpdates = useAppStore((state) => state.checkForUpdates);
  const relaunchApp = useAppStore((state) => state.relaunchApp);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const activeDirty = isDirty(activeTab);
  const activeUntitled = isUntitledDocument(activeTab?.document);
  const canSave = Boolean(activeTab?.document.editable && (activeDirty || activeUntitled));
  const hasDocumentOutline =
    activeTab?.document.kind === "pdf" ||
    activeTab?.document.kind === "epub" ||
    activeTab?.document.kind === "comic";
  const appWindow = getCurrentWindow();

  const setMode = (mode: string) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      void setThemeMode(mode);
    }
  };

  return (
    <header className="grid h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-border bg-titlebar text-titlebar-foreground shadow-[0_1px_0_color-mix(in_srgb,var(--foreground)_5%,transparent)]">
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
          <div className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground shadow-sm">
            B
          </div>
          <span className="text-xs tracking-wide text-foreground">BNOTE</span>
          {zenMode ? (
            <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              ZEN
            </span>
          ) : null}
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

      <div className="flex h-full items-center pr-1">
        <ToggleGroup
          type="single"
          value={themeMode}
          onValueChange={setMode}
          className="mr-1 h-7 rounded-md border border-border bg-muted/35 p-0.5"
        >
          {(["dark", "light", "system"] satisfies ThemeMode[]).map((mode) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={mode} className="h-6 min-w-7 rounded px-1.5">
                  {mode === "dark" ? <Moon className="size-3.5" /> : null}
                  {mode === "light" ? <Sun className="size-3.5" /> : null}
                  {mode === "system" ? <Monitor className="size-3.5" /> : null}
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>{mode[0].toUpperCase() + mode.slice(1)} theme</TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="mr-1 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={createNewFile}
            >
              <FilePlus2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New file (Ctrl+N)</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="mr-2 h-8 w-8 text-muted-foreground hover:text-foreground">
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>File</DropdownMenuLabel>
            <DropdownMenuItem onClick={createNewFile}>
              <FilePlus2 className="size-3.5" />
              New File
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+N</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openFromDialog()}>
              <FileText className="size-3.5" />
              Open
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+O</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openFolderFromDialog()}>
              <Folder className="size-3.5" />
              Open Folder
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+O</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canSave} onClick={() => void saveActiveTab()}>
              Save
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+S</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab} onClick={() => void saveActiveTabAs()}>
              Save As
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Shift+S</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void toggleSidebar()}>
              {sidebarCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
              {sidebarCollapsed ? "Show Workspace" : "Hide Workspace"}
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+B</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasDocumentOutline} onClick={() => void toggleDocumentOutline()}>
              <ListTree className="size-3.5" />
              {documentOutlineCollapsed ? "Show Chapters" : "Hide Chapters"}
              <span className="ml-auto text-xs text-muted-foreground">Ctrl+Alt+B</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void toggleZenMode()}>
              <Focus className="size-3.5" />
              {zenMode ? "Exit Zen" : "Enter Zen"}
              <span className="ml-auto text-xs text-muted-foreground">F11</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Clipboard</DropdownMenuLabel>
            <DropdownMenuItem disabled={!isFilesystemDocument(activeTab?.document)} onClick={() => void copyActivePath()}>
              <ClipboardCopy className="size-3.5" />
              Copy Path
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!activeTab} onClick={() => void copyActiveFileInfo()}>
              <ClipboardCopy className="size-3.5" />
              Copy File Info
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Editor</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={editorSettings.showLineNumbers}
              onCheckedChange={(checked) => void setShowLineNumbers(Boolean(checked))}
            >
              Line numbers
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={editorSettings.wordWrap}
              onCheckedChange={(checked) => void setWordWrap(Boolean(checked))}
            >
              Word wrap
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Font size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(editorSettings.fontSize)}
              onValueChange={(value) => void setEditorFontSize(Number(value))}
            >
              {[12, 13, 14, 16, 18].map((size) => (
                <DropdownMenuRadioItem key={size} value={String(size)}>
                  {size}px
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tab size</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(editorSettings.tabSize)}
              onValueChange={(value) => void setEditorTabSize(Number(value))}
            >
              {[2, 4, 8].map((size) => (
                <DropdownMenuRadioItem key={size} value={String(size)}>
                  {size} spaces
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>System</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => void showSystemInfo()}>
              <Info className="size-3.5" />
              System Info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void checkForUpdates()}>
              <RefreshCw className="size-3.5" />
              Check Updates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void relaunchApp()}>
              <RotateCcw className="size-3.5" />
              Restart BNote
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
