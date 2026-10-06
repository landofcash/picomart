import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Native modal behavior keeps focus inside account forms and restores it on close. */
export default function AccountDialog({
  open,
  title,
  busy = false,
  onClose,
  children,
  className,
  headerAccessory,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  headerAccessory?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const returnFocus = document.activeElement;
    if (open && element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      if (
        open &&
        returnFocus instanceof HTMLElement &&
        returnFocus.isConnected
      ) {
        returnFocus.focus();
      }
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // A closing popover can still intercept Escape during its exit animation.
          event.preventDefault();
          event.stopPropagation();
          if (!busy) onClose();
        }
      }}
      className={cn(
        "m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/50",
        className,
      )}
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {headerAccessory}
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
