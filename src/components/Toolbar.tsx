import type React from "react";
import { ExternalLink, FolderOpen, PanelLeft, Save, SaveAll } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/useAppStore";
import { isDirty, isEditableDocument } from "@/utils/files";

function ToolButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar() {
  const activeTabId = useAppStore((state) => state.activeTabId);
  const tabs = useAppStore((state) => state.tabs);
  const isBusy = useAppStore((state) => state.isBusy);
  const openFromDialog = useAppStore((state) => state.openFromDialog);
  const saveActiveTab = useAppStore((state) => state.saveActiveTab);
  const saveActiveTabAs = useAppStore((state) => state.saveActiveTabAs);
  const openActiveExternally = useAppStore((state) => state.openActiveExternally);
  const revealActiveFile = useAppStore((state) => state.revealActiveFile);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const dirty = isDirty(activeTab);

  return (
    <div className="flex h-9 items-center justify-between border-b border-border bg-background px-2">
      <div className="flex items-center gap-1">
        <ToolButton label="Open file (Ctrl+O)" disabled={isBusy} onClick={() => void openFromDialog()}>
          <FolderOpen />
        </ToolButton>
        <ToolButton
          label="Save (Ctrl+S)"
          disabled={!activeTab || !isEditableDocument(activeTab.document) || !dirty || isBusy}
          onClick={() => void saveActiveTab()}
        >
          <Save />
        </ToolButton>
        <ToolButton label="Save as (Ctrl+Shift+S)" disabled={isBusy} onClick={() => void saveActiveTabAs()}>
          <SaveAll />
        </ToolButton>
      </div>
      <div className="flex items-center gap-1">
        <ToolButton label="Open externally" disabled={!activeTab || isBusy} onClick={() => void openActiveExternally()}>
          <ExternalLink />
        </ToolButton>
        <ToolButton label="Reveal in folder" disabled={!activeTab || isBusy} onClick={() => void revealActiveFile()}>
          <PanelLeft />
        </ToolButton>
      </div>
    </div>
  );
}
