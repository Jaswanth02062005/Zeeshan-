import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeeshans | Fine Dining Restaurant",
  description: "Experience premium culinary creations and order your favorite dishes online.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zeeshans"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased h-screen overflow-hidden flex justify-center bg-black">
        <div className="w-full max-w-md h-full bg-[#0d0d0e] text-[#f4f4f6] relative flex flex-col shadow-2xl border-x border-[#1a1a1f] overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
