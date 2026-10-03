declare module 'react-pageflip' {
  import * as React from 'react';

  export interface HTMLFlipBookProps {
    width?: number;
    height?: number;
    size?: 'fixed' | 'stretch';
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    className?: string;
    drawShadow?: boolean;
    startPage?: number;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    swipeDistance?: number;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }

  const HTMLFlipBook: React.FC<HTMLFlipBookProps>;

  export default HTMLFlipBook;
}
