import {createContext,useContext,useState,type ReactNode} from 'react';
import type {DeliveryInfo} from '@/components/DeliveryInfoForm';

const CheckoutDetails=createContext<{key:string;delivery:DeliveryInfo}|null>(null);
const UpdateCheckoutDetails=createContext<(value:{key:string;delivery:DeliveryInfo})=>void>(()=>{});
// Delivery form values stay in memory, like the original order context. Only
// encrypted messages and public recovery metadata are persisted by commerce.
export function TempoCheckoutDetailsProvider({children}:{children:ReactNode}){
  const [value,setValue]=useState<{key:string;delivery:DeliveryInfo}|null>(null);
  return <CheckoutDetails.Provider value={value}><UpdateCheckoutDetails.Provider value={setValue}>{children}</UpdateCheckoutDetails.Provider></CheckoutDetails.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useTempoCheckoutDetails(){return {details:useContext(CheckoutDetails),saveDetails:useContext(UpdateCheckoutDetails)};}
