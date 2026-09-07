export const metadata = {
  title: "Sapo Webhook App",
  description: "Serverless webhook handler for Sapo inventory sync",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
