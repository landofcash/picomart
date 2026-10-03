import React, {useEffect, useState} from "react";
import {resolveName} from "@/lib/cryptoNameHelpers.ts";
import CopyableField from "@/components/CopyableField.tsx";
import {getHederaAccountIdFromEvmAddress} from "@/lib/hedera/hederaUtils.ts";

interface AddressDisplayProps {
  value: string;
  length?: number;
  mdLength?: number;
  small?: boolean;
  className?: string;
  copyable?: boolean;
  preferAccountId?: boolean;
}

const AddressDisplay: React.FC<AddressDisplayProps> = ({
                                                         value,
                                                         length = 8,
                                                         mdLength = 17,
                                                         small = false,
                                                         className = "",
                                                         copyable = true,
                                                         preferAccountId = false,
                                                       }) => {
  const [displayValue, setDisplayValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const resolveAddress = async () => {
      try {
        setLoading(true);

        if (/^\d+\.\d+\.\d+$/.test(value.trim())) {
          if (!cancelled) {
            setDisplayValue(value);
          }
          return;
        }

        if (preferAccountId) {
          const accountId = await getHederaAccountIdFromEvmAddress(value);
          if (!cancelled) {
            setDisplayValue(accountId.toString());
          }
          return;
        }

        const resolvedName = await resolveName(value);
        if (!cancelled) {
          setDisplayValue(resolvedName);
        }
      } catch (error) {
        console.error('AddressDisplay error resolving:', error);
        if (!cancelled) {
          setDisplayValue(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (value) {
      void resolveAddress();
    } else {
      setDisplayValue(null);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [preferAccountId, value]);

  // Show loading state briefly
  if (loading) {
    return (
      <CopyableField
        value={value}
        small={small}
        length={length}
        mdLength={mdLength}
        className={`${className} text-muted-foreground`.trim()}
        copyable={copyable}
      />
    );
  }

  return (
    <CopyableField
      value={value}
      displayValue={displayValue ?? value}
      small={small}
      length={length}
      mdLength={mdLength}
      className={className}
      copyable={copyable}
    />
  );
};

export default AddressDisplay;
