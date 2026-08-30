import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:{default:'Oxygn / AI-native governance, risk, and compliance',template:'%s / Oxygn'}, description:'AI-native governance, risk, and compliance for regulated financial institutions.', openGraph:{title:'Oxygn / AI-native governance, risk, and compliance',description:'AI-native governance, risk, and compliance for regulated financial institutions.',type:'website'} };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
