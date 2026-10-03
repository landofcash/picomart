import HTMLFlipBook from 'react-pageflip'
import {useEffect, useState} from "react";
import {useLocation, useParams} from 'react-router-dom';
import {Swiper, SwiperSlide} from 'swiper/react';
import {Pagination} from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import CoverPage from '@/components/CoverPage';
import ProductPageDesktop from "@/components/ProductPageDesktop.tsx";
import ProductPageMobile from "@/components/ProductPageMobile.tsx";
import FinalPage from '@/components/FinalPage';
import {type Product} from "@/lib/productSchemas.ts";
import {DEFAULT_CATALOG_SEED, DEFAULT_NETWORK, isNetworkId, setCurrentNetwork} from '@/config.ts';
import type {NetworkId} from "@/context/wallet/types.ts";
import {loadCatalog} from '@/lib/catalog/load';
import {isApprovedShopWallet} from "@/lib/approvedShop.ts";

function resolveNetworkId(searchParams: URLSearchParams): NetworkId {
  const queryNetwork = searchParams.get("network") ?? searchParams.get("n");
  if (isNetworkId(queryNetwork)) {
    return queryNetwork;
  }

  return DEFAULT_NETWORK;
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogueSeed, setCatalogueSeed] = useState<string>('');
  const [activeNetwork, setActiveNetwork] = useState<NetworkId>(DEFAULT_NETWORK);
  const [isApprovedWallet, setIsApprovedWallet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadCatalogue = async () => {
      try {
        setLoading(true);
        setError(null);

        const pathSeed = params.seed as string | undefined;
        const searchParams = new URLSearchParams(location.search);
        const querySeed = searchParams.get('seed') || undefined;
        const requestedNetwork = resolveNetworkId(searchParams);
        const seedParam = pathSeed || querySeed || DEFAULT_CATALOG_SEED;

        setActiveNetwork(requestedNetwork);
        setCurrentNetwork(requestedNetwork);
        setCatalogueSeed(seedParam);
        setProducts([]);
        setIsApprovedWallet(false);

        const {metadata, products: parsedProducts} = await loadCatalog(seedParam, requestedNetwork, controller.signal);
        if (cancelled) return;

        const approved = await isApprovedShopWallet(metadata.shopWallet, requestedNetwork);
        if (cancelled) return;

        setIsApprovedWallet(approved);
        setProducts(parsedProducts);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load catalogue');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadCatalogue();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [location.search, params.seed]);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="text-center py-20 text-muted-foreground text-lg">
          Loading catalogue...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="text-center py-20 text-red-600 text-lg max-w-md">
          <h2 className="text-xl font-semibold mb-2">Error Loading Catalogue</h2>
          <p className="text-sm">{error}</p>
          <div className="text-xs text-gray-500 mt-4 space-y-1">
            <p>Try using one of these URL formats:</p>
            <p>- Path: /your-seed-here</p>
            <p>- Query: ?seed=your-seed-here</p>
            <p>- Optional network override: ?network=moderato</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-screen px-4 py-6">
      <div key="header" className="h-full overflow-hidden drop-shadow-[0_20px_60px_rgba(0,0,0,0.35)] w-full max-w-[1200px]">
        {products.length > 0 ? (
          isMobile ? (
            <Swiper
              modules={[Pagination]}
              pagination={{clickable: true}}
              spaceBetween={12}
              slidesPerView={1}
              className="promo-catalogue h-[620px] w-full max-w-[400px]"
            >
              <SwiperSlide key="cover">
                <div className="w-full h-full">
                  <CoverPage isApprovedWallet={isApprovedWallet} network={activeNetwork}/>
                </div>
              </SwiperSlide>
              {products.map((product) => (
                <SwiperSlide key={product.ProductId}>
                  <div className="w-full h-full">
                    <ProductPageMobile
                      catalogueSeed={catalogueSeed}
                      product={product}
                      isApprovedWallet={isApprovedWallet}
                      network={activeNetwork}
                    />
                  </div>
                </SwiperSlide>
              ))}
              <SwiperSlide key="footer">
                <div className="w-full h-full">
                  <FinalPage/>
                </div>
              </SwiperSlide>
            </Swiper>
          ) : (
            <HTMLFlipBook
              width={550}
              height={600}
              size="fixed"
              minWidth={315}
              maxWidth={1000}
              minHeight={400}
              maxHeight={700}
              maxShadowOpacity={0.3}
              showCover={false}
              drawShadow={true}
              mobileScrollSupport={true}
              usePortrait={false}
              className="promo-catalogue"
              style={{}}
              startPage={0}
              flippingTime={1000}
              useMouseEvents={true}
              clickEventForward={true}
              showPageCorners={true}
              disableFlipByClick={false}
              startZIndex={0}
              autoSize={false}
              swipeDistance={0}
            >
              <div key="cover" className="w-full h-full">
                <CoverPage isApprovedWallet={isApprovedWallet} network={activeNetwork}/>
              </div>
              {products.map((product, index) => (
                <div key={product.ProductId} className="w-full h-full">
                  <ProductPageDesktop
                    catalogueSeed={catalogueSeed}
                    product={product}
                    pageNumber={index + 1}
                    isApprovedWallet={isApprovedWallet}
                    network={activeNetwork}
                  />
                </div>
              ))}
              <div key="footer" className="w-full h-full">
                <FinalPage/>
              </div>
            </HTMLFlipBook>
          )
        ) : (
          <div className="text-center py-20 text-muted-foreground text-lg">
            No products found in this catalogue.
          </div>
        )}
      </div>
    </main>
  );
}
