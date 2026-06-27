import * as React from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

export const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>): React.ReactElement => (
  <PanelGroup
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

export const ResizablePanel = Panel;

export const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
}): React.ReactElement => (
  <PanelResizeHandle
    className={cn(
      "group relative flex w-px items-center justify-center bg-border transition-colors duration-fast after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-live/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[resize-handle-state=drag]:bg-live",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-7 w-3.5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-1 transition-colors duration-fast group-hover:text-live group-data-[resize-handle-state=drag]:text-live">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" />
          <circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" />
        </svg>
      </div>
    )}
  </PanelResizeHandle>
);
