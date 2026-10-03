import React, { useEffect, useState } from "react";
import { truncateString, formatCryptoKeyToBase64 } from "@/lib/cryptoFormat";

const ExpandableData: React.FC<{ value: string | CryptoKey; length?: number }> = ({
                                                                                     value,
                                                                                     length = 11,
                                                                                 }) => {
    const [expanded, setExpanded] = useState(false);
    const [displayValue, setDisplayValue] = useState<string>("");

    useEffect(() => {
        const format = async () => {
            if (value instanceof CryptoKey) {
                const base64value = await formatCryptoKeyToBase64(value);
                setDisplayValue(base64value);
            } else {
                setDisplayValue(value);
            }
        };
        format();
    }, [value]);

    const finalDisplay = expanded ? displayValue : truncateString(displayValue, length);

    return (
        <p
            className="break-all cursor-pointer text-sm hover:text-yellow-400 transition"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Click to collapse" : "Click to expand"}
        >
            {finalDisplay}
        </p>
    );
};

export default ExpandableData;
