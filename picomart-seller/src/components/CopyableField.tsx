import React, {useState} from "react";
import {truncateString} from "@/lib/cryptoFormat";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "@/components/ui/tooltip";

interface CopyableFieldProps {
    label?: string;
    value: string;
    displayValue?: string;
    small?: boolean;
    length?: number;
    mdLength?: number;
}

const CopyableField: React.FC<CopyableFieldProps> = ({label, value, displayValue=null, small = false, length = 0, mdLength = 0}) => {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = async (e: React.MouseEvent)  => {
        e.stopPropagation();
        e.preventDefault();
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error("Failed to copy!", err);
        }
    };

    const displayText = copied ? (
        <span className="text-green-400 font-semibold">Copied!</span>
    ) : (
        truncateString(displayValue??value, length)
    );
    const displayTextMd = copied ? (
        <span className="text-green-400 font-semibold">Copied!</span>
    ) : (
        truncateString(displayValue??value, mdLength)
    );
    const clickable = (
        <button
            type="button"
            onClick={copyToClipboard}
            className={`max-w-fit inline-block cursor-pointer bg-transparent border-0 p-0 m-0 text-left ${small ? "text-xs" : "text-sm"} hover:underline`}
        >
            <span className="md:hidden  font-mono">{displayText}</span>
            <span className="hidden md:inline break-words whitespace-pre-wrap font-mono">{displayTextMd}</span>
        </button>
    );

    const fullDisplay = displayValue ?? value;
    const shouldShowTooltip = displayValue!==null ||
        (length > 0 && fullDisplay !== truncateString(fullDisplay, length));

    return (
        <div className="flex flex-col space-y-1"  onFocusCapture={(e) => {
            e.stopPropagation();
        }}>
            {label && <div className="text-muted-foreground">{label}</div>}
            {shouldShowTooltip ? (
                <TooltipProvider delayDuration={500}>
                    <Tooltip>
                        <TooltipTrigger asChild>{clickable}</TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-[300px] break-words text-xs">
                            {displayValue??value}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                clickable
            )}
        </div>
    );
};

export default CopyableField;
