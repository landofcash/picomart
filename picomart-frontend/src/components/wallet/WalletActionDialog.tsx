import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WalletActionDialog({
  title,
  description,
  busy,
  error,
  status,
  onClose,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  error: string | null;
  status?: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    heading.current?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-slate-950/50"
    >
      <div className="flex max-h-[calc(100dvh_-_2rem)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/70 px-4 py-2 sm:px-5">
          <h2
            ref={heading}
            id={titleId}
            className="text-lg font-semibold"
            tabIndex={-1}
          >
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <p
            id={descriptionId}
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {description}
          </p>
          {status && (
            <p
              role="status"
              className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-200"
            >
              {status}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <fieldset disabled={busy} className="min-w-0">
            {children}
          </fieldset>
        </div>
      </div>
    </dialog>
  );
}
