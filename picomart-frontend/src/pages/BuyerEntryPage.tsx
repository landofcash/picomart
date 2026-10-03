import {useLocation} from 'react-router-dom';
import App from '@/App';
import TempoMarketPage from './TempoMarketPage';

export default function BuyerEntryPage(){
  return useLocation().hash?<TempoMarketPage/>:<App/>;
}
