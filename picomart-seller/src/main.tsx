import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import './index.css';
import {WalletProvider} from './context/WalletContext';
import Layout from './components/Layout';
import App from './App';
import {SellerWalletPopupProvider} from './context/SellerWalletPopup';
import PrintQRCodesPage from './pages/PrintQRCodesPage';
import TempoCatalogsPage from './pages/TempoCatalogsPage';
import TempoOrdersPage from './pages/TempoOrdersPage';
import TempoSettingsPage from './pages/TempoSettingsPage';
import TempoWalletPage from './pages/TempoWalletPage';
import TempoContractPage from './pages/TempoContractPage';
import {StorefrontSession} from './lib/storefront/session';
import StorefrontsPage from './pages/StorefrontsPage';
import StorefrontWorkspacePage from './pages/StorefrontWorkspacePage';
import CatalogueEditPage from './pages/CatalogueEditPage';

createRoot(document.getElementById('root')!).render(<StrictMode><WalletProvider><BrowserRouter><SellerWalletPopupProvider><Layout><Routes>
  <Route path="/" element={<App/>}/>
  <Route path="/add-product-catalogue" element={<TempoCatalogsPage/>}/>
  <Route path="/print-qr-codes" element={<PrintQRCodesPage/>}/>
  <Route path="/edit-product-catalogue" element={<CatalogueEditPage/>}/>
  <Route path="/my-orders" element={<TempoOrdersPage seller/>}/>
  <Route path="/order-details" element={<TempoOrdersPage seller/>}/>
  <Route path="/settings" element={<TempoSettingsPage seller/>}/>
  <Route path="/tempo-wallet" element={<TempoWalletPage/>}/>
  <Route path="/tempo-contract" element={<TempoContractPage/>}/>
  <Route path="/storefronts" element={<StorefrontSession><StorefrontsPage/></StorefrontSession>}/>
  <Route path="/storefronts/:shopId" element={<StorefrontSession><StorefrontWorkspacePage/></StorefrontSession>}/>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Layout></SellerWalletPopupProvider></BrowserRouter></WalletProvider></StrictMode>);
