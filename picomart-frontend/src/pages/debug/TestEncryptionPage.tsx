import React, {useState} from "react";
import {ArrowLeft, Lock, ArrowRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Link} from "react-router-dom";
import AppShellCard from "@/components/AppShellCard";
import {useWallet} from "@/context/WalletContext";
import {generateKeyPairFromB64} from "@/utils/keygen";
import {generateAESKey, encryptAES, encryptWithECIES} from "@/utils/encryption";
import {b64FromBytes, hashCryptoKeyToB64, sha256} from "@/utils/encoding";
import ExpandableData from "@/components/ExpandableData";
import {signPrefix} from "@/config";

const TestEncryptionPage: React.FC = () => {
  const {walletAddress, signMessage} = useWallet();

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
      setError("Connect Hedera wallet");
      return;
    }

    try {
      setError(null);
      const messageToSign = signPrefix + seed;
      const signed = await signMessage(messageToSign, "Sign encryption seed");
      const signedBase64 = btoa(String.fromCharCode(...new Uint8Array(signed)));
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
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Lock className="h-6 w-6"/>
            Test Encryption
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="seed" className="block text-sm font-medium mb-1">
              Seed (base64 uuid)
            </label>
            <input id="seed" type="text" placeholder="Enter seed..." value={seed}
                   onChange={(e) => setSeed(e.target.value)}
                   className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"/>
          </div>

          <div>
            <label htmlFor="payload" className="block text-sm font-medium mb-1">
              Payload text
            </label>
            <textarea id="payload" placeholder="Enter text to encrypt..." value={payload}
                      onChange={(e) => setPayload(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 h-24 resize-none"/>
          </div>

          <Button onClick={signAndEncrypt} className="w-full" size="lg" disabled={!seed || !payload}>
            <Lock className="mr-2 h-4 w-4"/>
            Sign & Encrypt
          </Button>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}

          {signedSeed && (
            <div className="p-3 bg-muted rounded-md">
              <h3 className="font-semibold text-yellow-600 mb-2 text-sm">Signed Seed (base64)</h3>
              <ExpandableData value={signedSeed}/>
            </div>
          )}

          {keyPair && (
            <div className="p-3 bg-muted rounded-md space-y-2">
              <div>
                <p className="text-sm font-medium">🔓 Public Key:</p>
                <p className="text-xs font-mono break-all">{keyPair.publicKey}</p>
              </div>
              <div>
                <p className="text-sm font-medium">🔐 Private Key:</p>
                <ExpandableData value={keyPair.privateKey}/>
              </div>
            </div>
          )}

          {aesKey && symmetricKeyHash && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">🔑 AES Key Hash:</p>
              <p className="text-xs font-mono break-all">{symmetricKeyHash}</p>
            </div>
          )}

          {payloadHash && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium">📦 Payload Hash:</p>
              <p className="text-xs font-mono break-all">{payloadHash}</p>
            </div>
          )}

          {encryptedPayload && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Payload</h3>
              <ExpandableData value={encryptedPayload}/>
            </div>
          )}

          {encryptedSymKey && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-semibold text-green-700 mb-2 text-sm">Encrypted Symmetric Key</h3>
              <ExpandableData value={encryptedSymKey}/>
            </div>
          )}

          {/* Navigation to Decryption */}
          <div className="pt-4 border-t">
            <Link to="/debug/decrypt" className="block w-full">
              <Button variant="outline" className="w-full" size="lg">
                <ArrowRight className="mr-2 h-4 w-4"/>
                Go to Decryption
              </Button>
            </Link>
          </div>
        </CardContent>
      </AppShellCard>
    </div>
  );
};

export default TestEncryptionPage;
