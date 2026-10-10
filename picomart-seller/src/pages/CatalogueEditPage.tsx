import { useState, useRef, type DragEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { getConfig, type TokenConfig } from "@/config";
import { encodeBase64Uuid } from "@/lib/uuidUtils";
import { validateSingleTokenCatalogue } from "@/lib/catalogueValidation.ts";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  Upload,
  Edit,
  Trash2,
  Info,
  ExternalLink,
  Cloud,
  ArrowRight,
  FileImage,
  Coins,
  ChevronDown,
  Check,
} from "lucide-react";
import { formatUnits } from "ethers";
import {
  currencyAmount,
  validateImage,
  uploadCatalog,
} from "@/lib/catalogStorage";
import { useWallet } from "@/context/WalletContext.tsx";
import TokenIcon from "@/components/TokenIcon";
import TokenAmount from "@/components/TokenAmount";
import AccountUnlockButton from "@/components/wallet/AccountUnlockButton";
import AccountDialog from "@/components/wallet/AccountDialog";
import {loadDeliverySets,publishedDeliverySet,deliverySetsChanged,type DeliverySet} from '@/lib/deliverySets';
import type {TempoDeliveryOptions} from '@picomart/order-protocol/tempo-protocol';
import {TempoDeliveryOptionsSchema} from '@picomart/order-protocol/tempo-protocol';
import {set} from 'idb-keyval';
import {loadCatalogueDraft, type CatalogueProduct as Product, type ScopedCatalogueDraft} from '@/lib/catalogueDraft';

// Character limits
const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 320;

type EditableProduct = {
  Name: string;
  Description: string;
  Price: string; // full-unit price
  LocalFile?: File;
};

function toEditableProduct(
  product: Product,
  tokens: TokenConfig[],
): EditableProduct {
  const token = tokens.find((t) => t.tokenId === product.PriceToken);
  const decimals = token?.decimals ?? 0;
  return {
    Name: product.Name,
    Description: product.Description,
    Price: formatUnits(product.Price, decimals), // micro → full
    LocalFile: product.LocalFile,
  };
}

function CatalogueEditPage() {
  const { walletAddress, walletAdapter, walletLocked, network } = useWallet();
  const config = getConfig(network);
  const supportedTokens = config.supportedTokens;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogueToken, setCatalogueToken] = useState<string>(
    supportedTokens[0]?.tokenId ?? "",
  );
  const [catalogueTokenNetwork, setCatalogueTokenNetwork] = useState(network);
  const [isTokenConfirmed, setIsTokenConfirmed] = useState(false);
  const [isTokenPickerOpen, setIsTokenPickerOpen] = useState(false);
  const [deliverySets,setDeliverySets]=useState<DeliverySet[]>(()=>loadDeliverySets());
  const [selectedDeliverySet,setSelectedDeliverySet]=useState('');
  const [deliveryOptions,setDeliveryOptions]=useState<TempoDeliveryOptions|null>(null);
  useEffect(()=>{const refresh=()=>setDeliverySets(loadDeliverySets());window.addEventListener(deliverySetsChanged,refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener(deliverySetsChanged,refresh);window.removeEventListener('focus',refresh);};},[]);
  const [newProduct, setNewProduct] = useState<EditableProduct>({
    Name: "",
    Description: "",
    Price: "",
    LocalFile: undefined,
  });
  const [uploadProgress, setUploadProgress] = useState("");
  const uploadController = useRef<AbortController | null>(null);
  const uploadRunning = useRef(false);
  useEffect(() => () => uploadController.current?.abort(), []);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const draftScope=`picomart_catalog_draft_v2_${network}_${walletAddress?.toLowerCase()??'local'}`;
  const [loadedDraftScope,setLoadedDraftScope]=useState('');
  const activeDraft = useRef<ScopedCatalogueDraft | undefined>(undefined);
  useEffect(() => {
    if (!loadedDraftScope) return;
    activeDraft.current = {scope:loadedDraftScope,draft:{version:2,products,currency:catalogueToken,confirmed:isTokenConfirmed,setId:selectedDeliverySet,delivery:deliveryOptions}};
  }, [loadedDraftScope,products,catalogueToken,isTokenConfirmed,selectedDeliverySet,deliveryOptions]);
  useEffect(()=>{
    let live=true;setLoadedDraftScope('');
    const localScope=`picomart_catalog_draft_v2_${network}_local`;
    void loadCatalogueDraft(draftScope,localScope,activeDraft.current).then(draft=>{
      if(!live)return;
      if(draft&&draft.version!==2)throw new Error('Unsupported catalogue draft. Recreate this catalogue.');
      setProducts(draft?.products??[]);setCatalogueToken(draft?.currency??supportedTokens[0]?.tokenId??'');
      setCatalogueTokenNetwork(network);setIsTokenConfirmed(draft?.confirmed??false);setSelectedDeliverySet(draft?.setId??'');
      setDeliveryOptions(draft?.delivery?TempoDeliveryOptionsSchema.parse(draft.delivery):null);setLoadedDraftScope(draftScope);
    }).catch(error=>{if(live)toast.error((error as Error).message);});
    return()=>{live=false;};
  },[draftScope,network,supportedTokens]);
  useEffect(()=>{
    if(loadedDraftScope!==draftScope)return;
    void set(draftScope,{version:2,products,currency:catalogueToken,confirmed:isTokenConfirmed,setId:selectedDeliverySet,delivery:deliveryOptions}).catch(()=>toast.error('Catalogue draft could not be saved on this device.'));
  },[loadedDraftScope,draftScope,products,catalogueToken,isTokenConfirmed,selectedDeliverySet,deliveryOptions]);

  useEffect(() => {
    uploadController.current?.abort();
  }, [walletAddress, network]);

  useEffect(() => {
    if (walletLocked) {
      uploadController.current?.abort();
    }
  }, [walletLocked]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    products.forEach((p) => {
      if (p.LocalFile) urls[p.ProductId] = URL.createObjectURL(p.LocalFile);
    });
    setPreviews(urls);
    // cleanup on unmount or change:
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [products]);

  useEffect(() => {
    if (editingId) {
      const prod = products.find((p) => p.ProductId === editingId);
      if (prod) {
        setNewProduct(toEditableProduct(prod, supportedTokens));
      }
    }
  }, [editingId, products, supportedTokens]);

  useEffect(() => {
    if (catalogueTokenNetwork === network || products.length > 0) return;
    setCatalogueToken(supportedTokens[0]?.tokenId ?? "");
    setCatalogueTokenNetwork(network);
    setIsTokenConfirmed(false);
  }, [catalogueTokenNetwork, network, products.length, supportedTokens]);

  const catalogueNetworkMismatch = catalogueTokenNetwork !== network;
  const canEditProducts = isTokenConfirmed && !catalogueNetworkMismatch;
  const selectedCatalogueToken = supportedTokens.find(
    (token) => token.tokenId === catalogueToken,
  );

  const handleCatalogueTokenChange = (tokenId: string) => {
    if (products.length > 0) return;
    setCatalogueToken(tokenId);
    setCatalogueTokenNetwork(network);
    setIsTokenConfirmed(false);
    setIsTokenPickerOpen(false);
    setSelectedDeliverySet('');setDeliveryOptions(null);
  };

  const handleConfirmCatalogueToken = () => {
    if (!supportedTokens.some((token) => token.tokenId === catalogueToken)) {
      toast.error("Choose a supported currency before continuing.");
      return;
    }
    setCatalogueTokenNetwork(network);
    setIsTokenConfirmed(true);
  };

  const handleImageDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      try {
        validateImage(file);
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
      setNewProduct((prev) => ({ ...prev, LocalFile: file }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        validateImage(file);
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
      setNewProduct((prev) => ({ ...prev, LocalFile: file }));
    }
  };

  const handleAddOrUpdateProduct = () => {
    const { Name, Price, LocalFile } = newProduct;
    if (
      !canEditProducts ||
      !supportedTokens.some((token) => token.tokenId === catalogueToken)
    ) {
      toast.error("Confirm a catalog currency before adding products.");
      return;
    }
    if (!Name.trim() || !Price || !LocalFile) {
      toast.error("Enter a name, price and image.");
      return;
    }
    let microPrice: string;
    try {
      validateImage(LocalFile);
      microPrice = currencyAmount(Price,catalogueToken);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    const imageUrl = "";

    const productEntry: Product = {
      ProductId: editingId ?? encodeBase64Uuid(crypto.randomUUID()),
      Name: newProduct.Name,
      Description: newProduct.Description,
      Price: microPrice,
      PriceToken: catalogueToken,
      Image: imageUrl,
      LocalFile,
    };

    setProducts((prev) => {
      if (editingId) {
        return prev.map((p) => (p.ProductId === editingId ? productEntry : p));
      }
      return [...prev, productEntry];
    });

    setNewProduct({
      Name: "",
      Description: "",
      Price: "",
    });
    setEditingId(null);
    setShowModal(false);
    toast(editingId ? "Product updated" : "Product added");
  };

  const handleUploadAll = async () => {
    if (uploadRunning.current) return;
    if (!canEditProducts || !walletAddress || !walletAdapter) {
      toast.error("Select your Picomart account before uploading.");
      return;
    }
    uploadRunning.current = true;
    uploadController.current = new AbortController();
    setUploading(true);
    setUploadProgress("Checking upload availability...");
    try {
      if(!deliveryOptions||deliveryOptions.currency!==catalogueToken)throw new Error('Choose and confirm a delivery set matching the catalogue currency.');
      const token = validateSingleTokenCatalogue(
        products,
        supportedTokens.map((item) => item.tokenId),
      );
      if (token !== catalogueToken)
        throw new Error(
          "Catalog products do not match the confirmed currency.",
        );
      const result = await uploadCatalog(
        walletAdapter,
        config.fileApiUrl,
        products,
        deliveryOptions,
        uploadController.current.signal,
        setUploadProgress,
      );
      uploadController.current.signal.throwIfAborted();
      setUploadProgress("Products and images checked. Ready for review.");
      navigate("/add-product-catalogue", { state: { url: result.url } });
    } catch (error) {
      toast.error((error as Error).message);
      setUploadProgress(
        "Upload not completed. Retry the same products when storage is available.",
      );
    } finally {
      setUploading(false);
      uploadRunning.current = false;
    }
  };

  const openAddProductModal = () => {
    if (!canEditProducts) {
      toast.error("Confirm a catalog currency before adding products.");
      return;
    }
    setNewProduct({
      Name: "",
      Description: "",
      Price: "",
    });
    setEditingId(null);
    setShowModal(true);
  };

  return (
    <div className="seller-page space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Create catalog
      </h1>
      <nav
        aria-label="Publishing progress"
        className="flex flex-wrap gap-3 text-sm"
      >
        <span aria-current="step" className="font-semibold">
          1. Add products
        </span>
        <span className="text-muted-foreground">2. Review catalog</span>
        <span className="text-muted-foreground">3. Publish</span>
      </nav>
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">Delivery set</h2><Link to="/delivery-options" target="_blank" className="underline">Manage delivery sets</Link></div>
        <p className="text-sm text-muted-foreground">Choose options for this catalogue. Delivery fees use its confirmed currency.</p>
        <label className="block">Saved set<select className="w-full rounded-md border bg-background px-3 py-2" value={selectedDeliverySet} onChange={e=>{setSelectedDeliverySet(e.target.value);setDeliveryOptions(null);}}><option value="">Choose a delivery set</option>{deliverySets.filter(s=>s.options.currency===catalogueToken).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <Button variant="outline" disabled={!selectedDeliverySet||!isTokenConfirmed} onClick={()=>{try{const selected=deliverySets.find(s=>s.id===selectedDeliverySet);if(!selected)throw new Error('Choose a saved delivery set.');setDeliveryOptions(structuredClone(publishedDeliverySet(selected)));}catch(e){toast.error((e as Error).message);}}}>Confirm delivery set</Button>
        {deliveryOptions&&<div className="space-y-2"><p className="text-sm font-medium">Confirmed delivery options</p>{deliveryOptions.methods.map(m=><div key={m.id}><strong>{m.name}</strong><p className="text-sm text-muted-foreground">{m.description}</p>{m.type!=='digital'&&(m.type==='customer-address'?m.services:m.locations).map(o=><p className="text-sm" key={o.id}>{o.name} · {o.amount==='0'?'Free':`${formatUnits(o.amount,selectedCatalogueToken?.decimals??0)} ${selectedCatalogueToken?.name??''}`}{'address' in o?` · ${o.address} · ${'schedule' in o?o.schedule:''}`:''}</p>)}</div>)}</div>}
      </section>
      {/* Catalogue Storage Options Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            Add products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-primary/5 p-4 rounded border-l-4 border-primary/20 text-sm text-foreground space-y-3">
            <div className="flex items-start gap-3">
              <Cloud className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <p className="font-medium">Create with Picomart Seller</p>
                <p className="text-primary">
                  Use this page to create your product catalog and store it on
                  our secure servers. This is the easiest way to get started -
                  just add your products and we'll handle the hosting.{" "}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            {isTokenConfirmed ? "Catalog currency" : "Choose your currency"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isTokenConfirmed ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted p-4">
              <div className="flex items-center gap-3">
                <TokenIcon
                  assetId={catalogueToken}
                  size={36}
                  alt={selectedCatalogueToken?.name ?? catalogueToken}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Catalog currency
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {selectedCatalogueToken?.name ?? catalogueToken}
                  </p>
                </div>
              </div>
              {products.length === 0 && !catalogueNetworkMismatch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTokenConfirmed(false)}
                >
                  Change
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                All products in this catalog use one currency.
              </p>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Popover
                  open={isTokenPickerOpen}
                  onOpenChange={setIsTokenPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-label="Currency"
                      aria-expanded={isTokenPickerOpen}
                      className="w-full justify-between"
                      disabled={products.length > 0}
                    >
                      <span className="flex items-center gap-2">
                        <TokenIcon
                          assetId={catalogueToken}
                          size={20}
                          alt={selectedCatalogueToken?.name ?? catalogueToken}
                        />
                        {selectedCatalogueToken?.name ?? catalogueToken}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] p-1"
                  >
                    {supportedTokens.map((token) => (
                      <button
                        key={token.tokenId}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                        onClick={() =>
                          handleCatalogueTokenChange(token.tokenId)
                        }
                      >
                        <TokenIcon
                          assetId={token.tokenId}
                          size={20}
                          alt={token.name}
                        />
                        <span className="flex-1">{token.name}</span>
                        {catalogueToken === token.tokenId && (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                onClick={handleConfirmCatalogueToken}
                className="w-full"
                disabled={!catalogueToken}
              >
                Confirm currency & continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {catalogueNetworkMismatch && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-900">
            This catalog was started on {catalogueTokenNetwork}. Switch back to
            that network before editing or uploading it.
          </CardContent>
        </Card>
      )}

      {canEditProducts && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap  items-center justify-between gap-2">
                <CardTitle>Products List ({products.length})</CardTitle>
                <Button
                  onClick={openAddProductModal}
                  disabled={uploading}
                  className="w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Product
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>
                    No products added yet. Click "Add New Product" to get
                    started.
                  </p>
                </div>
              ) : (
                products.map((product) => {
                  const token = supportedTokens.find(
                    (t) => t.tokenId === product.PriceToken,
                  );
                  if (!token) {
                    // show an inline error for this one
                    return (
                      <div
                        key={product.ProductId}
                        className="p-4 bg-red-50 text-red-700 rounded"
                      >
                        ⚠️ Unsupported token (coinType={product.PriceToken}) for
                        “{product.Name}”{" "}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={product.ProductId}
                      className="border rounded-md p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
                    >
                      <img
                        src={
                          previews[product.ProductId] ||
                          product.Image ||
                          undefined
                        }
                        alt={product.Name}
                        className="w-20 h-20 object-cover rounded self-center sm:self-auto"
                      />

                      <div className="flex-1">
                        <div className="font-bold text-lg">{product.Name}</div>
                        <div className="text-muted-foreground text-sm">
                          {product.Description}
                        </div>
                        <div className="mt-1 text-sm font-mono flex items-center flex-wrap gap-1">
                          <TokenAmount token={product.PriceToken} amount={product.Price} size={16} />
                        </div>
                      </div>

                      <div className="flex gap-2 flex-wrap justify-end w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={uploading}
                          onClick={() => {
                            setEditingId(product.ProductId);
                            setShowModal(true);
                          }}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={uploading}
                          onClick={() =>
                            setProducts((prev) =>
                              prev.filter(
                                (p) => p.ProductId !== product.ProductId,
                              ),
                            )
                          }
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}

      {canEditProducts && (
        <Card>
          <CardHeader>
            <CardTitle>Continue to Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload your products and check their images before publishing.
              Nothing goes live until you approve.
            </p>
            <p role="status" className="text-sm">
              {uploadProgress}
            </p>
            <p className="text-sm text-muted-foreground">
              You will see the publication fee before final approval.
            </p>
            <AccountUnlockButton />
            <Button
              onClick={handleUploadAll}
              disabled={
                uploading ||
                walletLocked ||
                products.length === 0 ||
                !walletAddress ||
                !walletAdapter
              }
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Uploading products..." : "Upload and review"}
            </Button>
          </CardContent>
        </Card>
      )}

      <details className="rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Advanced: use an uploaded catalog
        </summary>
        <p className="mt-3 text-muted-foreground">
          Already uploaded your products to the Picomart catalog service? Open
          their hosted URL for review.
        </p>
        <Link
          to="/add-product-catalogue"
          className="inline-flex items-center gap-1 mt-2 underline"
        >
          <ExternalLink className="h-3 w-3" />
          Review hosted catalog
        </Link>
      </details>

      <AccountDialog
        open={showModal}
        title={editingId ? "Edit product" : "Add product"}
        onClose={() => setShowModal(false)}
        className="max-w-2xl bg-card"
      >
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6">
          {/* Left Column - Product Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="name">Product Name</Label>
                <span className="text-xs text-muted-foreground">
                  {newProduct.Name.length} of {NAME_MAX_LENGTH}
                </span>
              </div>
              <Input
                id="name"
                value={newProduct.Name}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= NAME_MAX_LENGTH) {
                    setNewProduct({ ...newProduct, Name: value });
                  }
                }}
                placeholder="Enter product name"
                maxLength={NAME_MAX_LENGTH}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                <span className="text-xs text-muted-foreground">
                  {newProduct.Description.length} of {DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="description"
                rows={4}
                value={newProduct.Description}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.length <= DESCRIPTION_MAX_LENGTH) {
                    setNewProduct({ ...newProduct, Description: value });
                  }
                }}
                placeholder="Describe your product..."
                maxLength={DESCRIPTION_MAX_LENGTH}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">
                Price (
                {supportedTokens.find(
                  (token) => token.tokenId === catalogueToken,
                )?.name ?? catalogueToken}
                )
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={newProduct.Price}
                onChange={(e) =>
                  setNewProduct({
                    ...newProduct,
                    Price: e.target.value,
                  })
                }
                placeholder="0.00"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All products use the catalog currency selected above.
            </p>
          </div>

          {/* Right Column - Image Upload */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product Image</Label>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Drag and drop area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleImageDrop}
                className="border-2 border-dashed border-input rounded-lg p-6 text-center bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer min-h-[200px] flex flex-col items-center justify-center"
                onClick={() => fileInputRef.current?.click()}
              >
                {newProduct.LocalFile ? (
                  <div className="space-y-3">
                    <img
                      src={URL.createObjectURL(newProduct.LocalFile)}
                      className="max-w-full max-h-32 object-contain rounded"
                      alt="Preview"
                    />
                    <p className="text-sm text-muted-foreground">
                      {newProduct.LocalFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Click to change image{" "}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <FileImage className="h-12 w-12 text-muted-foreground mx-auto" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Drop image here</p>
                      <p className="text-xs text-muted-foreground">
                        Supports <br />
                        JPG, PNG, GIF, WebP up to 10 MiB{" "}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <FileImage className="h-4 w-4 mr-2" />
                      Select File
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddOrUpdateProduct}>
            {editingId ? "Update Product" : "Add Product"}
          </Button>
        </div>
      </AccountDialog>
    </div>
  );
}

export default CatalogueEditPage;
