import WalletReceivePage from "@/pages/WalletReceivePage";
import {TempoCheckoutDetailsProvider} from '@/context/TempoCheckoutDetails';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import './index.css';
import {WalletProvider} from './context/WalletContext';
import Layout from './components/Layout';
import BuyerEntryPage from './pages/BuyerEntryPage';
import WalletPage from './pages/WalletPage';
import TempoScanPage from './pages/TempoScanPage';
import TempoCartPage from './pages/TempoCartPage';
import TempoCheckoutPage from './pages/TempoCheckoutPage';
import TempoOrdersPage from './pages/TempoOrdersPage';
import TempoSettingsPage from './pages/TempoSettingsPage';
import TempoWalletPage from './pages/TempoWalletPage';
import TempoContractPage from './pages/TempoContractPage';
import TempoAgentOrderApprovalPage from './pages/TempoAgentOrderApprovalPage';

createRoot(document.getElementById('root')!).render(<StrictMode><WalletProvider><BrowserRouter><TempoCheckoutDetailsProvider><Layout><Routes>
  <Route path="/" element={<BuyerEntryPage/>}/>
  <Route path="/scan" element={<TempoScanPage/>}/>
  <Route path="/cart" element={<TempoCartPage/>}/>
  <Route path="/order" element={<TempoCheckoutPage stage="review"/>}/>
  <Route path="/pay-crypto" element={<TempoCheckoutPage stage="payment"/>}/>
  <Route path="/orders" element={<TempoOrdersPage/>}/>
  <Route path="/wallet" element={<WalletPage/>}/>
  <Route path="/wallet/receive" element={<WalletReceivePage/>}/>
  <Route path="/wallet/receive/transfer" element={<WalletReceivePage mode="transfer"/>}/>
  <Route path="/wallet/receive/test-tokens" element={<WalletReceivePage mode="test-tokens"/>}/>
  <Route path="/settings" element={<TempoSettingsPage/>}/>
  <Route path="/tempo-wallet" element={<TempoWalletPage/>}/>
  <Route path="/tempo-contract" element={<TempoContractPage/>}/>
  <Route path="/agent-orders/approve" element={<TempoAgentOrderApprovalPage/>}/>
  <Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Layout></TempoCheckoutDetailsProvider></BrowserRouter></WalletProvider></StrictMode>);
