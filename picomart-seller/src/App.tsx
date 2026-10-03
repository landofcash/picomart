import { useWallet } from './context/WalletContext'
import HomeConnected from '@/pages/home/HomeConnected'
import HomeDisconnected from '@/pages/home/HomeDisconnected'

function App() {
  const { walletAddress } = useWallet()

  return walletAddress ? <HomeConnected /> : <HomeDisconnected />
}

export default App
