import React from "react";
import {tryGetTokenByType} from "@/lib/tokenUtils.ts";

interface TokenIconProps {
  assetId: number | string;
  size?: number;
  alt?: string;
  className?: string;
}

const TokenIcon: React.FC<TokenIconProps> = ({assetId, size = 20, alt = '', className = ''}) => {
  const token = tryGetTokenByType(String(assetId));
  const imgSrc = token ? token.img ?? `/tokens/${token.id}-icon.png` : null;
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

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
    setFailedSrc(imgSrc);
  };

  // If the image failed or no src was ever available, show fallback
  if (!imgSrc || failedSrc === imgSrc) {
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
         className={`rounded-full inline-block align-middle ${className}`} onError={handleError}/>
  );
};

export default TokenIcon;
