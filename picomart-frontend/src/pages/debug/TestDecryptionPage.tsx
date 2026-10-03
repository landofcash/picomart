import React, {useState} from "react";
import {ArrowLeft, Unlock, ArrowLeft as ArrowLeftIcon} from "lucide-react";
import {Button} from "@/components/ui/button";
import {CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Link} from "react-router-dom";
import AppShellCard from "@/components/AppShellCard";
import {useWallet} from "@/context/WalletContext";
import {generateKeyPairFromB64} from "@/utils/keygen";
import {decryptAES, decryptWithECIES} from "@/utils/encryption";
import {b64FromBytes, sha256} from "@/utils/encoding";
import ExpandableData from "@/components/ExpandableData";
import {signPrefix} from "@/config";

const TestDecryptionPage: React.FC = () => {
  const {walletAddress, signMessage} = useWallet();

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
      const messageToSign = signPrefix + seed;
      const signed= await signMessage(messageToSign, "Sign encryption seed");
      const signedB64 = btoa(String.fromCharCode(...new Uint8Array(signed)));
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
    <div className="w-full flex items-start justify-center px-4 py-8 sm:py-10">
      <AppShellCard className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5"/>
            </Button>
          </Link>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Unlock className="h-6 w-6"/>
            Test Decryption
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
            <label htmlFor="encryptedPayload" className="block text-sm font-medium mb-1">
              Encrypted Payload (base64)
            </label>
            <textarea id="encryptedPayload" placeholder="Paste encrypted payload..." value={encryptedPayload}
                      onChange={(e) => setEncryptedPayload(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 h-24 resize-none"/>
          </div>

          <div>
            <label htmlFor="encryptedSymKey" className="block text-sm font-medium mb-1">
              Encrypted Symmetric Key (base64)
            </label>
            <textarea id="encryptedSymKey" placeholder="Paste encrypted symmetric key..." value={encryptedSymKey}
                      onChange={(e) => setEncryptedSymKey(e.target.value)}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 h-24 resize-none"/>
          </div>

          <Button onClick={handleDecrypt} className="w-full" size="lg"
                  disabled={!seed || !encryptedPayload || !encryptedSymKey}>
            <Unlock className="mr-2 h-4 w-4"/>
            Sign & Decrypt
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

          {aesKey && (
            <div className="p-3 bg-muted rounded-md">
              <h3 className="font-semibold text-blue-600 mb-2 text-sm">Decrypted AES Key</h3>
              <ExpandableData value={aesKey}/>
            </div>
          )}

          {decryptedPayload && (
            <>
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <h3 className="font-semibold text-green-700 mb-2 text-sm">Decrypted Payload</h3>
                <p className="break-words text-sm bg-white p-2 rounded border">{decryptedPayload}</p>
              </div>
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <h3 className="font-semibold text-green-700 mb-2 text-sm">Payload Hash (Base64)</h3>
                <p className="break-all text-xs font-mono">{payloadHash}</p>
              </div>
            </>
          )}

          {/* Navigation to Encryption */}
          <div className="pt-4 border-t">
            <Link to="/debug/encrypt" className="block w-full">
              <Button variant="outline" className="w-full" size="lg">
                <ArrowLeftIcon className="mr-2 h-4 w-4"/>
                Go to Encryption
              </Button>
            </Link>
          </div>
        </CardContent>
      </AppShellCard>
    </div>
  );
};

export default TestDecryptionPage;
