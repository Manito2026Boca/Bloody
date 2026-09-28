import '../../../app/globals.css';
import './auth.css';

export const metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
