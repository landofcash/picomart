import React from "react";
import {tryGetTokenByType} from "@/lib/tokenUtils.ts";
import type {NetworkId} from '@/context/wallet/types';

interface TokenIconProps {
  assetId: number | string;
  size?: number;
  alt?: string;
  className?: string;
  network?: NetworkId;
}

const TokenIcon: React.FC<TokenIconProps> = ({assetId, size = 20, alt = '', className = '', network}) => {
  const token = tryGetTokenByType(String(assetId), network);
  // Use token.id for the fallback icon filename to support tokenId-based lookups
  const imgSrc = token?.img ?? `${import.meta.env.BASE_URL}tokens/${token?.id ?? '0'}-icon.png`;
  const [failedSource, setFailedSource] = React.useState<string | null>(null);

  if (!token) {
    return (
      <span className={`inline-block align-middle text-xs font-semibold ${className}`} style={{
        width: size,
        height: size,
        lineHeight: `${size}px`,
        textAlign: 'center',
        border: '1px solid #ccc',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        ?
      </span>
    );
  }

  const handleError = () => {
    setFailedSource(imgSrc);
  };

  // If the image failed or no src was ever available, show fallback
  if (failedSource === imgSrc || !imgSrc) {
    return (
      <span className={`inline-block align-middle text-xs font-semibold ${className}`} style={{
        width: size,
        height: size,
        lineHeight: `${size}px`,
        textAlign: 'center',
        border: '1px solid #ccc',
        borderRadius: '50%',
        display: 'flex', // Use flexbox for centering
        alignItems: 'center', // Center vertically
        justifyContent: 'center' // Center horizontally
      }}>
                {token.name.substring(0, 1).toUpperCase()}
            </span>
    );
  }

  return (
    <img src={imgSrc} alt={alt || `Token ${token.name}`} width={size} height={size}
         className={`rounded-full inline-block shrink-0 align-middle ${className}`} onError={handleError}/>
  );
};

export default TokenIcon;
