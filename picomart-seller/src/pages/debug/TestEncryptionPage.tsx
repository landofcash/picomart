import React, { useState } from "react";
import { useWallet } from "@/context/WalletContext";
import { generateKeyPairFromB64 } from "@/utils/keygen";
import { generateAESKey, encryptAES, encryptWithECIES } from "@/utils/encryption";
import { b64FromBytes, hashCryptoKeyToB64, sha256 } from "@/utils/encoding";
import ExpandableData from "@/components/ExpandableData";
import { signPrefix } from "@/config";

const TestEncryptionPage: React.FC = () => {
    const { walletAddress, signMessage } = useWallet();

    const [seed, setSeed] = useState("");
    const [payload, setPayload] = useState("");
    const [signedSeed, setSignedSeed] = useState<string | null>(null);
    const [keyPair, setKeyPair] = useState<{ publicKey: string; privateKey: string } | null>(null);
    const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
    const [encryptedPayload, setEncryptedPayload] = useState<string | null>(null);
    const [encryptedSymKey, setEncryptedSymKey] = useState<string | null>(null);
    const [symmetricKeyHash, setSymmetricKeyHash] = useState<string | null>(null);
    const [payloadHash, setPayloadHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const signAndEncrypt = async () => {
        if (!walletAddress) {
            setError("Connect your wallet");
            return;
        }

        try {
            setError(null);
            const dataToSign = signPrefix + seed;
            const signedBytes = await signMessage(
                dataToSign,
                "Sign encryption seed"
            );
            const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signedBytes)));
            setSignedSeed(signedBase64);

            const generatedKeys = await generateKeyPairFromB64(signedBase64);
            setKeyPair(generatedKeys);

            const aes = await generateAESKey();
            setAesKey(aes);

            const encrypted = await encryptAES(aes, payload);
            setEncryptedPayload(encrypted);

            const encryptedKey = await encryptWithECIES(generatedKeys.publicKey, aes);
            setEncryptedSymKey(encryptedKey);

            const hashAES = await hashCryptoKeyToB64(aes);
            setSymmetricKeyHash(hashAES);

            const hashPayload = b64FromBytes(await sha256(new TextEncoder().encode(payload)));
            setPayloadHash(hashPayload);
        } catch (e) {
            console.error(e);
            setError("Encryption failed");
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-4">
            <h1 className="text-xl font-bold">🔐 Picomart Test Encryption Page</h1>

            <input
                type="text"
                placeholder="Seed (base64 uuid)"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="w-full p-2 border rounded"
            />

            <textarea
                placeholder="Payload text"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full p-2 border rounded h-28"
            />

            <button
                onClick={signAndEncrypt}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded"
            >
                Sign & Encrypt
            </button>

            {error && (
                <div className="p-3 bg-red-500 text-white rounded">{error}</div>
            )}

            {signedSeed && (
                <div className="bg-muted p-3 rounded">
                    <h3 className="font-semibold text-red-400 mb-1">Signed Seed (base64)</h3>
                    <ExpandableData value={signedSeed} />
                </div>
            )}

            {keyPair && (
                <div className="bg-muted p-3 rounded text-sm">
                    <p><strong>🔓 Public Key:</strong> {keyPair.publicKey}</p>
                    <p className="mt-2"><strong>🔐 Private Key:</strong></p>
                    <ExpandableData value={keyPair.privateKey} />
                </div>
            )}

            {aesKey && (
                <div className="bg-muted p-3 rounded text-sm">
                    <p><strong>🔑 AES Key Hash:</strong> {symmetricKeyHash}</p>
                </div>
            )}

            {payloadHash && (
                <div className="bg-muted p-3 rounded text-sm">
                    <p><strong>📦 Payload Hash:</strong> {payloadHash}</p>
                </div>
            )}

            {encryptedPayload && (
                <div className="bg-muted p-3 rounded">
                    <h3 className="font-semibold text-green-500 mb-1">Encrypted Payload</h3>
                    <ExpandableData value={encryptedPayload} />
                </div>
            )}

            {encryptedSymKey && (
                <div className="bg-muted p-3 rounded">
                    <h3 className="font-semibold text-green-500 mb-1">Encrypted Symmetric Key</h3>
                    <ExpandableData value={encryptedSymKey} />
                </div>
            )}
        </div>
    );
};

export default TestEncryptionPage;
