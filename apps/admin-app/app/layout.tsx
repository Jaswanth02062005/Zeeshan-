import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeeshans | Admin Control Center",
  description: "Manage categories, food items, and incoming live orders with realtime alerts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#09090b] text-[#f4f4f5]">
        {children}
      </body>
    </html>
  );
}
