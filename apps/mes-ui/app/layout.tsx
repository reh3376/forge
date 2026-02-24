import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MSALWrapper } from "@/lib/auth-context";
import { Header } from "@/components/ui/header";
import { WorkspaceLayout } from "@/components/layout/workspace-layout";
import { MainContent } from "@/components/layout/main-content";
import { KeyboardShortcutsProvider } from "@/components/navigation/keyboard-shortcuts-provider";
import { KeyboardShortcutsDialog } from "@/components/navigation/keyboard-shortcuts-dialog";
import { QueryProvider } from "@/lib/api/query-provider";
import { GraphQLProvider } from "@/lib/api/apollo-provider";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

// Force all pages in the app to be dynamically rendered (no static generation)
// This is necessary because the app heavily uses client-side features
export const dynamic = 'force-dynamic'
export const dynamicParams = true
export const revalidate = 0

export const metadata: Metadata = {
  title: "Whiskey House - MES",
  description: "Manufacturing Execution System for Whiskey Production",
  icons: {
    icon: [
      {
        url: '/WHK_Logo_Symbol_RevWhite.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        url: '/WHK_Logo_Symbol_DkGrey.png',
        sizes: 'any',
        type: 'image/png',
      },
      {
        url: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      }
    ],
    apple: [
      {
        url: '/apple-icon.png',
        sizes: 'any',
        type: 'image/png',
      }
    ],
    shortcut: '/WHK_Logo_Symbol_RevWhite.ico',
  },
  manifest: '/manifest.json',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' }
  ],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'noindex, nofollow', // Since this is an internal MES system
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${inter.variable} ${roboto.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <MSALWrapper>
          <QueryProvider>
            <GraphQLProvider>
              <ThemeProvider
                defaultTheme="system"
                enableSystem
                storageKey="mes-ui-theme"
                attribute="class"
              >
              <KeyboardShortcutsProvider>
                <div className="flex flex-col h-screen">
                  <Header />
                  <WorkspaceLayout>
                    <MainContent>
                      {children}
                    </MainContent>
                  </WorkspaceLayout>
                  <Toaster />
                  {/* Global keyboard shortcuts dialog */}
                  <KeyboardShortcutsDialog />
                </div>
              </KeyboardShortcutsProvider>
            </ThemeProvider>
            </GraphQLProvider>
          </QueryProvider>
        </MSALWrapper>
      </body>
    </html>
  );
}
