import WalletReceivePage from "@/pages/WalletReceivePage";
import TempoCheckoutPage from '@/pages/TempoCheckoutPage';
import {TempoCheckoutDetailsProvider} from '@/context/TempoCheckoutDetails';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Route,Routes,Navigate} from 'react-router-dom';
import BuyerEntryPage from '@/pages/BuyerEntryPage';
import TempoScanPage from '@/pages/TempoScanPage';
import TempoCartPage from '@/pages/TempoCartPage';
import TempoSettingsPage from '@/pages/TempoSettingsPage';
import App from '@/App';
import WalletPage from '@/pages/WalletPage';
import TempoOrdersPage from '@/pages/TempoOrdersPage';
import TempoContractPage from '@/pages/TempoContractPage';
import '@/index.css';
import Layout from '@/components/Layout';

// Imported only by tools/verify-tempo-compact-links.mjs, with mocked public catalogs and camera input.
createRoot(document.getElementById('root')!).render(<BrowserRouter><TempoCheckoutDetailsProvider><Layout><Routes>
  <Route path="/" element={<BuyerEntryPage/>}/>
  <Route path="/scan" element={<TempoScanPage/>}/>
  <Route path="/order" element={<TempoCheckoutPage stage="review"/>}/>
  <Route path="/pay-crypto" element={<TempoCheckoutPage stage="payment"/>}/>
  <Route path="/cart" element={<TempoCartPage/>}/>
  <Route path="/settings" element={<TempoSettingsPage/>}/>
  <Route path="/home" element={<App/>}/>
  <Route path="/wallet" element={<WalletPage/>}/>
  <Route path="/wallet/receive" element={<WalletReceivePage/>}/>
  <Route path="/wallet/receive/transfer" element={<WalletReceivePage mode="transfer"/>}/>
  <Route path="/wallet/receive/test-tokens" element={<WalletReceivePage mode="test-tokens"/>}/>
  <Route path="/orders" element={<TempoOrdersPage/>}/>
  <Route path="/tempo-contract" element={<TempoContractPage/>}/>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Layout></TempoCheckoutDetailsProvider></BrowserRouter>);
