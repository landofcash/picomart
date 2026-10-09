import {APP_NAME, APP_VERSION} from '@/config';

export default function AppVersion() {
  return <footer className="shop-app-version">{APP_NAME} Storefront · v{APP_VERSION}</footer>;
}
