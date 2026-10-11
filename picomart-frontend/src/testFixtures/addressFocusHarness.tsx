// Loaded only by tools/verify-buyer-address-focus.mjs with mocked wallet/recovery.
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import {TempoCheckoutDetailsProvider} from '@/context/TempoCheckoutDetails';
import TempoCheckoutPage from '@/pages/TempoCheckoutPage';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <TempoCheckoutDetailsProvider>
      <Routes>
        <Route path="/order" element={<TempoCheckoutPage stage="review"/>}/>
        <Route path="/pay-crypto" element={<TempoCheckoutPage stage="payment"/>}/>
      </Routes>
    </TempoCheckoutDetailsProvider>
  </BrowserRouter>,
);
