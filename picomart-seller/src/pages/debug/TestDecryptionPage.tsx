import React, { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { generateKeyPairFromB64 } from "@/utils/keygen";
import { decryptAES, decryptWithECIES } from "@/utils/encryption";
import { b64FromBytes, sha256 } from "@/utils/encoding";
import ExpandableData from "@/components/ExpandableData";
import { signPrefix } from "@/config";

const TestDecryptionPage: React.FC = () => {
    const { walletAddress, signMessage } = useWallet();

    const [seed, setSeed] = useState("");
    const [encryptedPayload, setEncryptedPayload] = useState("");
    const [encryptedSymKey, setEncryptedSymKey] = useState("");
    const [signedSeed, setSignedSeed] = useState<string | null>(null);
    const [decryptedPayload, setDecryptedPayload] = useState<string | null>(null);
    const [payloadHash, setPayloadHash] = useState<string | null>(null);
    const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleDecrypt = async () => {
        if (!walletAddress) {
            setError("Please connect your wallet.");
            return;
        }

        try {
            setError(null);
            const dataToSign = signPrefix + seed;
            const signedBytes = await signMessage(
                dataToSign,
                "Sign seed for decryption"
            );
            const signedB64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)));
            setSignedSeed(signedB64);

            const keyPair = await generateKeyPairFromB64(signedB64);

            const decryptedKey = await decryptWithECIES(keyPair.privateKey, encryptedSymKey);
            setAesKey(decryptedKey);

            const decryptedText = await decryptAES(decryptedKey, encryptedPayload);
            setDecryptedPayload(decryptedText);

            const hash = b64FromBytes(await sha256(new TextEncoder().encode(decryptedText)));
            setPayloadHash(hash);
        } catch (e) {
            console.error(e);
            setError("Decryption failed.");
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <h1 className="text-xl font-bold">🔓 Picomart Test Decryption Page</h1>

            <input
                type="text"
                placeholder="Seed (base64 uuid)"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full p-2 border rounded"
            />

            <textarea
                placeholder="Encrypted Payload (base64)"
                value={encryptedPayload}
                onChange={(e) => setEncryptedPayload(e.target.value)}
                className="w-full p-2 border rounded h-24"
            />

            <textarea
                placeholder="Encrypted Symmetric Key (base64)"
                value={encryptedSymKey}
                onChange={(e) => setEncryptedSymKey(e.target.value)}
                className="w-full p-2 border rounded h-24"
            />

            <button
                onClick={handleDecrypt}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded"
            >
                Sign & Decrypt
            </button>

            {error && <div className="p-3 bg-red-500 text-white rounded">{error}</div>}

            {signedSeed && (
                <div className="bg-muted p-3 rounded">
                    <h3 className="font-semibold text-yellow-500 mb-1">Signed Seed (base64)</h3>
                    <ExpandableData value={signedSeed} />
                </div>
            )}

            {aesKey && (
                <div className="bg-muted p-3 rounded">
                    <h3 className="font-semibold text-green-500 mb-1">Decrypted AES Key</h3>
                    <ExpandableData value={aesKey} />
                </div>
            )}

            {decryptedPayload && (
                <>
                    <div className="bg-muted p-3 rounded">
                        <h3 className="font-semibold text-green-500 mb-1">Decrypted Payload</h3>
                        <p className="break-words text-sm">{decryptedPayload}</p>
                    </div>
                    <div className="bg-muted p-3 rounded">
                        <h3 className="font-semibold text-green-500 mb-1">Payload Hash (Base64)</h3>
                        <p className="break-all text-sm">{payloadHash}</p>
                    </div>
                </>
            )}
        </div>
    );
};

export default TestDecryptionPage;
