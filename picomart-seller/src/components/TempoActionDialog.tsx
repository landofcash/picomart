import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui/button";

export default function TempoActionDialog({
  title,
  children,
  busy,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-black/50"
    >
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{title}</h2>
        {children}
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
    </dialog>
  );
}
