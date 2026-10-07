import { isAddress } from "viem";
import { PICOMART_TEMPO_CONFIG } from "@picomart/config";

export function parseTempoRecipientQr(input: string): string {
  const text = input.trim();
  const uri =
    /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\?[^#]*)?$/i.exec(
      text,
    );
  if (uri?.[2] && BigInt(uri[2]) !== BigInt(PICOMART_TEMPO_CONFIG.chainId))
    throw new Error("This QR code is for a different network.");
  const recipient = uri ? uri[1] : text;
  if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient))
    throw new Error(
      "This QR code does not contain a valid Tempo account address.",
    );
  return recipient;
}
