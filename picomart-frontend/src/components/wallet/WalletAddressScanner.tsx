import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseTempoRecipientQr } from "@/lib/tempoRecipientQr";

export default function WalletAddressScanner({
  onAddress,
  onClose,
}: {
  onAddress: (address: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ onAddress, onClose });
  callbacks.current = { onAddress, onClose };
  useEffect(() => {
    let live = true;
    let controls: { stop: () => void } | undefined;
    const element = video.current!;
    const reader = new BrowserQRCodeReader();
    void reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        element,
        (result) => {
          if (!result || !live) return;
          try {
            const address = parseTempoRecipientQr(result.getText());
            live = false;
            controls?.stop();
            callbacks.current.onAddress(address);
            callbacks.current.onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        },
      )
      .then((value) => {
        controls = value;
        if (!live) controls.stop();
      })
      .catch(() => {
        if (live)
          setError(
            "Camera unavailable. Allow camera access, or enter the address instead.",
          );
      });
    return () => {
      live = false;
      controls?.stop();
      const stream = element.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
      element.srcObject = null;
    };
  }, []);
  return (
    <section aria-label="Scan recipient QR" className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-950">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-10 rounded-xl border-2 border-white/70" />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Camera className="h-4 w-4" />
        Point your camera at an account address QR code.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClose}
      >
        <X />
        Stop scanning
      </Button>
    </section>
  );
}
