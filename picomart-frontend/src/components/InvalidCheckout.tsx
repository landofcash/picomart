import {Link} from 'react-router-dom'

export default function InvalidCheckout({message}: {message: string}) {
  return <div className="mx-auto max-w-md p-6 space-y-4" role="status">
    <p>{message}</p>
    <Link to="/cart" className="underline font-medium">Return to cart</Link>
  </div>
}
