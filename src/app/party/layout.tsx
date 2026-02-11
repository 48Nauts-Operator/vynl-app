export default function PartyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Party page renders as a fixed fullscreen overlay (z-50)
  // The root AppShell still exists underneath, keeping the audio player active
  return <>{children}</>;
}
